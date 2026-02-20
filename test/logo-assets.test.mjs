import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const svgPath = path.join(root, 'src', 'assets', 'logo', 'rotary-dial-tester.svg')
const png192Path = path.join(root, 'src', 'assets', 'logo', 'rotary-dial-tester-192.png')
const pngPath = path.join(root, 'src', 'assets', 'logo', 'rotary-dial-tester.png')
const icoPath = path.join(root, 'src', 'favicon.ico')
const indexPath = path.join(root, 'src', 'index.html')
const manifestPath = path.join(root, 'src', 'manifest.webmanifest')

/**
 * Verifies the SVG logo exists and contains valid SVG markup without text.
 */
test('logo svg exists and contains no text nodes', () => {
    const svg = fs.readFileSync(svgPath, 'utf8')
    assert.ok(svg.includes('<svg'))
    assert.ok(!svg.includes('<text'))
})

/**
 * Verifies the PNG logo exists and has a valid PNG signature.
 */
test('logo png exists with a valid PNG signature', () => {
    const png = fs.readFileSync(pngPath)
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.equal(png.subarray(0, 8).toString('binary'), signature.toString('binary'))
})

/**
 * Verifies the 192x192 PNG icon exists and has a valid PNG signature.
 */
test('logo 192 png exists with a valid PNG signature', () => {
    const png = fs.readFileSync(png192Path)
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.equal(png.subarray(0, 8).toString('binary'), signature.toString('binary'))
})

/**
 * Verifies the favicon exists and has a valid ICO header.
 */
test('favicon.ico exists with a valid ICO header', () => {
    const ico = fs.readFileSync(icoPath)
    assert.equal(ico.readUInt16LE(0), 0)
    assert.equal(ico.readUInt16LE(2), 1)
    assert.ok(ico.readUInt16LE(4) >= 1)
})

/**
 * Verifies the HTML header references the logo asset.
 */
test('index.html references the logo asset', () => {
    const html = fs.readFileSync(indexPath, 'utf8')
    assert.ok(html.includes('rotary-dial-tester.svg'))
})

/**
 * Verifies the HTML head includes the web manifest reference.
 */
test('index.html references the manifest file', () => {
    const html = fs.readFileSync(indexPath, 'utf8')
    assert.ok(html.includes('manifest.webmanifest'))
})

/**
 * Verifies manifest includes both icon assets used for install surfaces.
 */
test('manifest references 192 and 512 logo assets', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const iconSrcs = (manifest.icons || []).map((icon) => icon.src)
    assert.ok(iconSrcs.includes('/assets/logo/rotary-dial-tester-192.png'))
    assert.ok(iconSrcs.includes('/assets/logo/rotary-dial-tester.png'))
})

/**
 * Verifies the diagrams placeholder text is present in the HTML.
 */
test('index.html includes the diagrams placeholder', () => {
    const html = fs.readFileSync(indexPath, 'utf8')
    assert.ok(html.includes('No diagrams yet.'))
})
