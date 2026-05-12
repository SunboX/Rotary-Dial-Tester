// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const htmlPath = path.join(process.cwd(), 'src', 'index.html')
/**
 * Ensures the footer version label is populated from package metadata at runtime.
 * @returns {void}
 */
test('index.html footer version is loaded from package.json', () => {
    const html = fs.readFileSync(htmlPath, 'utf8')

    // Keep the visible footer version tied to deployed package metadata instead of duplicated markup.
    assert.match(html, /<span id="appVersion" data-version-source="\.\/package\.json">\.\.\.<\/span>/)
})
