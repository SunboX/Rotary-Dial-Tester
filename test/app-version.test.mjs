// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAppVersion } from '../src/js/app/AppVersion.mjs'

/**
 * Creates the minimum document object needed by the app version loader.
 * @param {HTMLElement|object|null} versionElement
 * @returns {{ getElementById: (id: string) => HTMLElement|object|null }}
 */
function createDocumentMock(versionElement) {
    return {
        getElementById(id) {
            return id === 'appVersion' ? versionElement : null
        }
    }
}

/**
 * Verifies the footer version is loaded from package metadata at runtime.
 * @returns {Promise<void>}
 */
test('loadAppVersion updates the footer from package.json', async () => {
    const versionElement = { textContent: '...' }
    const requests = []

    const version = await loadAppVersion({
        documentRef: createDocumentMock(versionElement),
        fetchImpl: async (url, options) => {
            requests.push({ url, options })
            return {
                ok: true,
                async json() {
                    return { version: '2.3.4' }
                }
            }
        }
    })

    assert.equal(version, '2.3.4')
    assert.equal(versionElement.textContent, '2.3.4')
    assert.deepEqual(requests, [{ url: './package.json', options: { cache: 'no-store' } }])
})

/**
 * Verifies failed metadata loading keeps the existing footer text intact.
 * @returns {Promise<void>}
 */
test('loadAppVersion preserves fallback text when package metadata is unavailable', async () => {
    const versionElement = { textContent: 'fallback-version' }

    const version = await loadAppVersion({
        documentRef: createDocumentMock(versionElement),
        fetchImpl: async () => ({ ok: false })
    })

    assert.equal(version, null)
    assert.equal(versionElement.textContent, 'fallback-version')
})
