const needle = require('needle')

const package = require('./package')

const manifest = {
    id: 'org.open.video',
    version: package.version,
    logo: 'https://lh3.googleusercontent.com/_rb_ANr7xo4vefVqJll9SML2tB6iwd7DYyMZ30-OxkQ2Q2_HhhgVrBRZtTy93zNocoY=w300',
    name: 'Open Videos',
    description: 'Movie & TV Streams from Open Directories',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: []
}

const { addonBuilder, serveHTTP, publishToCentral }  = require('stremio-addon-sdk')

const addon = new addonBuilder(manifest)

function minTwoDigits(n) {
  return (n < 10 ? '0' : '') + n
}

function toStream(meta) {
  return {
    title: meta.file + '\n' + meta.reg_date + (meta.filesize ? ' | ' + meta.filesize : '') + (meta.filetype ? ' | ' + meta.filetype : ''),
    url: meta.link.split('\\').join('')
  }
}

function noSpecialChars(str) {
  return str.replace(/[^\w\s]/gi, '').replace(/ {1,}/g, ' ').trim()
}

function search(query) {
  return new Promise((resolve, reject) => {
    needle.post('https://filepursuit.com/jsn/v1/search.php', { searchQuery: query, type: 'video' }, (err, resp, body) => {
      if (err)
        reject(err)
      else if (body && Array.isArray(body) && body.length)
        resolve(body.map(toStream))
      else
        reject(new Error('Response body is empty'))
    })
  })  
}

const cache = {}

addon.defineStreamHandler(args => {
  return new Promise((resolve, reject) => {
    if (cache[args.id]) {
      resolve({ streams: cache[args.id] })
      return
    }
    needle.get('https://v3-cinemeta.strem.io/meta/' + args.type + '/' + args.id.split(':')[0] + '.json', (err, resp, body) => {

      if (body && body.meta) {

        let query = body.meta.name.toLowerCase()

        if (args.type == 'series' && args.id.includes(':')) {
          const idParts = args.id.split(':')
          query += ' s'+minTwoDigits(idParts[1])+'e'+minTwoDigits(idParts[2])
        }

        function respond(streams) {
          cache[args.id] = streams
          setTimeout(() => {
            delete cache[args.id]
          }, 86400000)
          resolve({ streams, cacheMaxAge: 86400 }) // cache for 1 day
        }

        search(encodeURIComponent(query)).then(streams => {
          respond(streams)
        }).catch(err => {
          // try removing special chars from query
          if (query != noSpecialChars(query)) {
            search(encodeURIComponent(noSpecialChars(query))).then(streams => {
              respond(streams)
            }).catch(err => {
              reject(err)
            })
          } else
            reject(err)
        })

      } else
        reject(new Error('Invalid response from Cinemeta'))
    })
  })
})

module.exports = addon.getInterface()
