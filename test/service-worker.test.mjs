import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const serviceWorkerPath = path.join(process.cwd(), 'src', 'service-worker.js')

/**
 * Reads service worker source for static contract assertions.
 * @returns {string}
 */
function readServiceWorkerSource() {
    return fs.readFileSync(serviceWorkerPath, 'utf8')
}

/**
 * Verifies service worker declares expected cache names and shell assets.
 */
test('service worker defines cache names and core precache entries', () => {
    const source = readServiceWorkerSource()
    assert.ok(source.includes("const CACHE_VERSION = 'rotary-dial-tester-v1'"))
    assert.ok(source.includes("const SHELL_CACHE = `${CACHE_VERSION}-shell`"))
    assert.ok(source.includes("const STATIC_CACHE = `${CACHE_VERSION}-static`"))

    const expectedAssets = [
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

    expectedAssets.forEach((asset) => {
        assert.ok(source.includes(`'${asset}'`))
    })
})

/**
 * Verifies navigation requests use network-first with cached index fallback.
 */
test('service worker navigation strategy is network-first with cached fallback', () => {
    const source = readServiceWorkerSource()
    assert.ok(source.includes("if (request.mode === 'navigate')"))
    assert.ok(source.includes('const response = await fetch(request)'))
    assert.ok(source.includes("return (await cache.match(request)) || (await cache.match('/index.html'))"))
})

/**
 * Verifies static assets use stale-while-revalidate behavior.
 */
test('service worker static strategy includes stale-while-revalidate flow', () => {
    const source = readServiceWorkerSource()
    assert.ok(source.includes('const cached = await cache.match(request)'))
    assert.ok(source.includes('const networkUpdate = fetch(request)'))
    assert.ok(source.includes('cache.put(request, response.clone())'))
    assert.ok(source.includes('if (cached) {'))
})
