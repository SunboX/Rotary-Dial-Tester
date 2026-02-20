const CACHE_VERSION = 'rotary-dial-tester-v1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const STATIC_CACHE = `${CACHE_VERSION}-static`

const CORE_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/js/main.mjs',
    '/assets/fonts/Manrope-Variable.woff2',
    '/vendor/webmcp-global.iife.js',
    '/assets/logo/rotary-dial-tester.svg',
    '/assets/logo/rotary-dial-tester.png',
    '/favicon.ico',
    '/manifest.webmanifest'
]

self.addEventListener('install', (event) => {
    event.waitUntil(precacheCoreShell())
})

self.addEventListener('activate', (event) => {
    event.waitUntil(cleanupOldCaches())
})

self.addEventListener('fetch', (event) => {
    const request = event.request
    if (!request || request.method !== 'GET') return

    const requestUrl = new URL(request.url)

    // Keep navigation resilient: try network first and fall back to cached shell.
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(request))
        return
    }

    // Keep static resources responsive while refreshing cache in the background.
    if (shouldUseStaticCache(request, requestUrl)) {
        event.respondWith(handleStaticRequest(request))
    }
})

/**
 * Pre-caches the minimal app shell for first offline reload.
 * @returns {Promise<void>}
 */
async function precacheCoreShell() {
    const cache = await caches.open(SHELL_CACHE)
    await cache.addAll(CORE_SHELL_ASSETS)
}

/**
 * Removes caches from previous service worker versions.
 * @returns {Promise<void>}
 */
async function cleanupOldCaches() {
    const cacheNames = await caches.keys()
    const allowed = new Set([SHELL_CACHE, STATIC_CACHE])
    const deletions = cacheNames.filter((name) => !allowed.has(name)).map((name) => caches.delete(name))
    await Promise.all(deletions)
}

/**
 * Applies network-first strategy for navigation requests.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleNavigationRequest(request) {
    try {
        const response = await fetch(request)
        const cache = await caches.open(SHELL_CACHE)
        cache.put(request, response.clone())
        return response
    } catch {
        const cache = await caches.open(SHELL_CACHE)
        return (await cache.match(request)) || (await cache.match('/index.html'))
    }
}

/**
 * Applies stale-while-revalidate strategy for static resources.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleStaticRequest(request) {
    const cache = await caches.open(STATIC_CACHE)
    const cached = await cache.match(request)

    const networkUpdate = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone())
            }
            return response
        })
        .catch(() => null)

    if (cached) {
        void networkUpdate
        return cached
    }

    const networkResponse = await networkUpdate
    if (networkResponse) {
        return networkResponse
    }

    return (await caches.match(request)) || Response.error()
}

/**
 * Returns whether a request should use the static stale-while-revalidate cache.
 * @param {Request} request
 * @param {URL} requestUrl
 * @returns {boolean}
 */
function shouldUseStaticCache(request, requestUrl) {
    if (requestUrl.origin !== self.location.origin) return false

    const staticDestinations = new Set(['script', 'style', 'font', 'image', 'worker', 'sharedworker', 'audioworklet'])
    if (staticDestinations.has(request.destination)) {
        return true
    }

    return requestUrl.pathname === '/manifest.webmanifest' || requestUrl.pathname === '/favicon.ico'
}
