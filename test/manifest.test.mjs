import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const manifestPath = path.join(process.cwd(), 'src', 'manifest.webmanifest')

/**
 * Verifies manifest file is valid JSON with required install fields.
 */
test('manifest.webmanifest contains required PWA metadata', () => {
    const raw = fs.readFileSync(manifestPath, 'utf8')
    const manifest = JSON.parse(raw)

    assert.equal(typeof manifest.name, 'string')
    assert.equal(typeof manifest.short_name, 'string')
    assert.equal(manifest.start_url, '/index.html')
    assert.equal(manifest.scope, '/')
    assert.equal(manifest.display, 'standalone')
    assert.equal(typeof manifest.theme_color, 'string')
    assert.equal(typeof manifest.background_color, 'string')
    assert.ok(Array.isArray(manifest.icons))
    assert.ok(manifest.icons.length >= 2)
})

/**
 * Verifies manifest icon entries point to 192x192 and 512x512 PNG assets.
 */
test('manifest.webmanifest references 192 and 512 PNG icons', () => {
    const raw = fs.readFileSync(manifestPath, 'utf8')
    const manifest = JSON.parse(raw)
    const iconBySize = new Map(manifest.icons.map((icon) => [icon.sizes, icon]))

    assert.equal(iconBySize.get('192x192')?.src, '/assets/logo/rotary-dial-tester-192.png')
    assert.equal(iconBySize.get('192x192')?.type, 'image/png')
    assert.equal(iconBySize.get('512x512')?.src, '/assets/logo/rotary-dial-tester.png')
    assert.equal(iconBySize.get('512x512')?.type, 'image/png')
})
