// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

/**
 * Reads a project file as UTF-8 text for licensing metadata assertions.
 * @param {string} path repository-relative file path
 * @returns {Promise<string>}
 */
async function readProjectFile(path) {
    // Keep path handling simple because tests run from the repository root.
    return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

/**
 * Verifies package metadata exposes the public GPL license in machine-readable form.
 * @returns {Promise<void>}
 */
test('package metadata declares GPL-3.0-or-later', async () => {
    const packageJson = JSON.parse(await readProjectFile('package.json'))
    const packageLock = JSON.parse(await readProjectFile('package-lock.json'))

    assert.equal(packageJson.license, 'GPL-3.0-or-later')
    assert.equal(packageLock.packages[''].license, 'GPL-3.0-or-later')
})

/**
 * Verifies the dual-licensing notice files required by the migration brief are present.
 * @returns {Promise<void>}
 */
test('repository documents public and commercial licensing paths', async () => {
    const readme = await readProjectFile('README.md')
    const commercialNotice = await readProjectFile('COMMERCIAL-LICENSE.md')
    const notice = await readProjectFile('NOTICE.md')
    const contributing = await readProjectFile('CONTRIBUTING.md')

    assert.match(readme, /GPL-3\.0-or-later/)
    assert.match(readme, /Commercial\/proprietary license/)
    assert.match(commercialNotice, /not itself a commercial license grant/)
    assert.match(notice, /Original source: https:\/\/github\.com\/SunboX\/Rotary-Dial-Tester/)
    assert.match(contributing, /separate commercial\/proprietary license offerings/)
})

/**
 * Verifies REUSE license texts and metadata cover the public license and third-party assets.
 * @returns {Promise<void>}
 */
test('REUSE license texts include project and bundled dependency licenses', async () => {
    const dep5 = await readProjectFile('.reuse/dep5')

    await Promise.all([
        readProjectFile('LICENSES/GPL-3.0-or-later.txt'),
        readProjectFile('LICENSES/CC-BY-SA-4.0.txt'),
        readProjectFile('LICENSES/OFL-1.1.txt'),
        readProjectFile('LICENSES/Apache-2.0.txt'),
        readProjectFile('LICENSES/MIT.txt')
    ])

    assert.match(dep5, /src\/assets\/fonts\/Manrope-Variable\.woff2/)
    assert.match(dep5, /src\/vendor\/webmcp-global\.iife\.js/)
})
