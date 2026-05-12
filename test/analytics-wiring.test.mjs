// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

/**
 * Ensures the static shell loads the centralized analytics tracker automatically.
 * @returns {Promise<void>}
 */
test('index.html embeds centralized analytics tracker', async () => {
    const html = await readFile(new URL('src/index.html', root), 'utf8')

    // Keep analytics wiring aligned with the central tracker service.
    assert.match(html, /src="https:\/\/analytics\.andrefiedler\.de\/tracker\.js"/)
    assert.match(html, /data-site="rotary_dial_tester_com"/)
    assert.match(html, /defer/)
    assert.doesNotMatch(html, /data-auto="false"/)
})
