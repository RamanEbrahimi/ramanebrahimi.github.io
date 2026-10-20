/* First Assist service worker. Plain JS, no bundler. API origins come from the registration URL (?api=…). */
var API_ORIGINS = new URL(self.location).searchParams.getAll('api')
// same-origin URL prefixes cached as static (the website gate passes its scope: page, manifest.json, *.enc)
var STATIC_PREFIXES = new URL(self.location).searchParams.getAll('static')

// mirror of src/lib/swRules.ts — keep in step
function classify(url, apiOrigins, staticPrefixes) {
  var u
  try { u = new URL(url) } catch { return 'none' }
  if (u.hostname === 'tiles.openfreemap.org') return 'tiles'
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return 'static'
  for (var i = 0; i < apiOrigins.length; i++) {
    var base = apiOrigins[i]
    if (url.indexOf(base + '/') === 0) {
      var path = url.slice(base.length).split(/[?#]/)[0]
      if (path.indexOf('/tiles/') === 0) return 'tiles'
      return isDataPath(path) ? 'api' : 'none'
    }
  }
  var pre = staticPrefixes || []
  for (var j = 0; j < pre.length; j++) if (url.indexOf(pre[j]) === 0) return 'static'
  return 'none'
}
// API paths cached for offline; everything else (/bundle/, /users/, /labels, /scans, /export, …) never touches Cache Storage
var DATA_PATHS = ['/aois', '/known', '/zones', '/candidates', '/user-boulders', '/trips/plan', '/metrics', '/land', '/crags', '/relief-candidates']
function isDataPath(path) {
  return DATA_PATHS.some(function (p) { return path === p || path.indexOf(p + '/') === 0 })
}
function shouldCache(method, status) { return method === 'GET' && status === 200 }
function shouldFallback(status) { return status >= 500 }
var FALLBACK_PATHS = ['/known', '/zones', '/candidates', '/user-boulders']
function fallbackKeyMatches(requestUrl, cachedUrl) {
  var a, b
  try { a = new URL(requestUrl); b = new URL(cachedUrl) } catch { return false }
  if (a.origin !== b.origin || a.pathname !== b.pathname) return false
  var known = FALLBACK_PATHS.some(function (p) { return a.pathname.slice(-p.length) === p })
  if (!known) return false
  return a.searchParams.get('aoi') === b.searchParams.get('aoi')
}
// end mirror

var NETWORK_TIMEOUT_MS = 4000
var CACHE = { api: 'fa-api', tiles: 'fa-tiles', static: 'fa-static' }

/** Re-wrap without Vary so a cached entry matches by URL alone (requests may carry Authorization). */
function store(cacheName, request, response) {
  if (!shouldCache(request.method, response.status)) return Promise.resolve()
  var headers = new Headers(response.headers)
  headers.delete('Vary')
  headers.set('x-fa-saved-at', String(Date.now()))
  return response.blob().then(function (body) {
    var clean = new Response(body, { status: response.status, statusText: response.statusText, headers: headers })
    return caches.open(cacheName).then(function (c) { return c.put(request.url, clean) })
  })
}

/** Newest cached response for the same data path and aoi (bbox/p_min/limit ignored); else Response.error(). */
function bestFallback(cacheName, url) {
  return caches.open(cacheName).then(function (cache) {
    // keys() gives Requests with real URLs (matched Responses built with new Response() have url "")
    return cache.keys(url, { ignoreSearch: true, ignoreVary: true }).then(function (keys) {
      var picked = keys.filter(function (k) { return fallbackKeyMatches(url, k.url) })
      return Promise.all(picked.map(function (k) { return cache.match(k, { ignoreVary: true }) })).then(function (hits) {
        var best = null, bestAt = -1
        for (var i = 0; i < hits.length; i++) {
          if (!hits[i]) continue
          var at = Number(hits[i].headers.get('x-fa-saved-at')) || 0
          if (at >= bestAt) { best = hits[i]; bestAt = at } // ties (no header): the later key wins
        }
        return best || Response.error()
      })
    })
  })
}

self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()) })

self.addEventListener('fetch', function (event) {
  var req = event.request
  if (req.method !== 'GET') return
  var kind = classify(req.url, API_ORIGINS, STATIC_PREFIXES)
  if (kind === 'none') return
  var name = CACHE[kind]
  if (kind === 'api') {
    var timer
    var timeout = new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('timeout')) }, NETWORK_TIMEOUT_MS) })
    var network = fetch(req).then(function (res) {
      event.waitUntil(store(name, req, res.clone()))
      return res
    })
    network.catch(function () {}) // a network that loses the race and rejects later is not an unhandled rejection
    var fromCache = function () {
      return caches.match(req.url, { ignoreVary: true }).then(function (hit) { return hit || bestFallback(name, req.url) })
    }
    event.respondWith(Promise.race([network, timeout]).then(function (res) {
      clearTimeout(timer)
      if (!shouldFallback(res.status)) return res
      return fromCache().then(function (hit) { return hit && hit.type !== 'error' ? hit : res }) // a 5xx: saved copy first
    }, function () {
      clearTimeout(timer)
      return fromCache()
    }))
    return
  }
  if (req.cache === 'no-cache') { // the caller wants the fresh copy (gate's online unlock): network, cache only when offline
    event.respondWith(fetch(req).then(function (res) {
      event.waitUntil(store(name, req, res.clone()))
      return res
    }, function () {
      return caches.match(req.url, { ignoreVary: true }).then(function (hit) { return hit || Response.error() })
    }))
    return
  }
  event.respondWith(caches.match(req.url, { ignoreVary: true }).then(function (hit) {
    var network = fetch(req).then(function (res) {
      return store(name, req, res.clone()).then(function () { return res })
    })
    if (hit) { event.waitUntil(network.catch(function () {})); return hit }
    return network.catch(function () { return Response.error() })
  }))
})
