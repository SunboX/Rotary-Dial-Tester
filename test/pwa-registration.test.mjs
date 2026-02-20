import assert from 'node:assert/strict'
import test from 'node:test'
import { registerServiceWorker } from '../src/js/pwa/registerServiceWorker.mjs'

/**
 * Verifies registration executes on supported secure contexts.
 * @returns {Promise<void>}
 */
test('registerServiceWorker registers in secure supported runtimes', async () => {
    const originalWindow = globalThis.window
    const originalNavigator = globalThis.navigator

    let registerCalls = 0

    globalThis.window = {
        isSecureContext: true,
        location: { hostname: 'example.com' }
    }
    globalThis.navigator = {
        serviceWorker: {
            async register(scriptUrl) {
                registerCalls += 1
                assert.equal(scriptUrl, '/service-worker.js')
                return { scope: '/' }
            }
        }
    }

    try {
        const result = await registerServiceWorker()
        assert.deepEqual(result, { registered: true, scope: '/' })
        assert.equal(registerCalls, 1)
    } finally {
        globalThis.window = originalWindow
        globalThis.navigator = originalNavigator
    }
})

/**
 * Verifies registration is skipped when secure-context requirements are not met.
 * @returns {Promise<void>}
 */
test('registerServiceWorker skips unsupported insecure contexts', async () => {
    const originalWindow = globalThis.window
    const originalNavigator = globalThis.navigator

    let registerCalls = 0

    globalThis.window = {
        isSecureContext: false,
        location: { hostname: 'example.com' }
    }
    globalThis.navigator = {
        serviceWorker: {
            async register() {
                registerCalls += 1
                return { scope: '/' }
            }
        }
    }

    try {
        const result = await registerServiceWorker()
        assert.deepEqual(result, { registered: false })
        assert.equal(registerCalls, 0)
    } finally {
        globalThis.window = originalWindow
        globalThis.navigator = originalNavigator
    }
})
