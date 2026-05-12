// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'

const siteOrigin = 'https://rotary-dial-tester.com'
const htmlPath = path.join(process.cwd(), 'src', 'index.html')
const robotsPath = path.join(process.cwd(), 'src', 'robots.txt')
const sitemapPath = path.join(process.cwd(), 'src', 'sitemap.xml')
const serverScriptPath = path.join(process.cwd(), 'server.mjs')

/**
 * Returns the current index.html source.
 * @returns {string}
 */
function readIndexHtml() {
    return fs.readFileSync(htmlPath, 'utf8')
}

/**
 * Extracts the content value for a named meta element.
 * @param {string} html
 * @param {string} metaName
 * @returns {string | null}
 */
function getMetaContent(html, metaName) {
    const metaPattern = new RegExp(`<meta\\s+name="${metaName}"\\s+content="([^"]+)"\\s*/?>`, 'i')
    return metaPattern.exec(html)?.[1] ?? null
}

/**
 * Extracts the href value for a rel link element.
 * @param {string} html
 * @param {string} relName
 * @returns {string | null}
 */
function getLinkHref(html, relName) {
    const linkPattern = new RegExp(`<link\\s+rel="${relName}"\\s+href="([^"]+)"\\s*/?>`, 'i')
    return linkPattern.exec(html)?.[1] ?? null
}

/**
 * Reserves an ephemeral port for the spawned app server.
 * @returns {Promise<number>}
 */
async function reservePort() {
    const blockingServer = net.createServer()

    await new Promise((resolve, reject) => {
        blockingServer.once('error', reject)
        blockingServer.listen(0, () => {
            resolve()
        })
    })

    const address = blockingServer.address()
    assert.ok(address)
    assert.equal(typeof address, 'object')

    const reservedPort = address.port

    await new Promise((resolve) => {
        blockingServer.close(resolve)
    })

    return reservedPort
}

/**
 * Starts the app server on a free local port.
 * @param {TestContext} context
 * @returns {Promise<{baseUrl: string}>}
 */
async function startAppServer(context) {
    const port = await reservePort()
    const serverProcess = spawn(process.execPath, [serverScriptPath], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
    })

    context.after(() => {
        if (serverProcess.exitCode === null) {
            serverProcess.kill('SIGKILL')
        }
    })

    await once(serverProcess.stdout, 'data')

    return { baseUrl: `http://127.0.0.1:${port}` }
}

/**
 * Ensures the root document has crawlable, canonical SEO metadata.
 * @returns {void}
 */
test('index.html exposes description, canonical URL, and crawlable robots metadata', () => {
    const html = readIndexHtml()

    assert.equal(getMetaContent(html, 'description'), 'Test and adjust mechanical rotary dials in the browser with Web Serial, RS-232 signal monitoring, timing diagrams, exports, and analysis tools.')
    assert.equal(getMetaContent(html, 'robots'), 'index,follow')
    assert.equal(getLinkHref(html, 'canonical'), `${siteOrigin}/`)
    assert.doesNotMatch(html, /noindex/i)
})

/**
 * Ensures crawler directives allow the public app and point to the sitemap.
 * @returns {void}
 */
test('robots.txt allows crawling and advertises sitemap.xml', () => {
    const robots = fs.readFileSync(robotsPath, 'utf8')

    assert.match(robots, /User-agent:\s*\*/i)
    assert.match(robots, /Allow:\s*\//i)
    assert.doesNotMatch(robots, /Disallow:\s*\//i)
    assert.match(robots, new RegExp(`Sitemap:\\s*${siteOrigin}/sitemap\\.xml`, 'i'))
})

/**
 * Ensures the sitemap lists the canonical public app URL.
 * @returns {void}
 */
test('sitemap.xml lists the canonical root URL', () => {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8')

    assert.match(sitemap, /<urlset\b/)
    assert.match(sitemap, new RegExp(`<loc>${siteOrigin}/</loc>`))
})

/**
 * Ensures important public routes and crawl assets return successful HTTP responses.
 * @param {TestContext} context
 * @returns {Promise<void>}
 */
test('important public URLs return 200 from the local server', { timeout: 5000 }, async (context) => {
    const { baseUrl } = await startAppServer(context)
    const publicPaths = [
        '/',
        '/index.html',
        '/robots.txt',
        '/sitemap.xml',
        '/manifest.webmanifest',
        '/style.css',
        '/assets/logo/rotary-dial-tester.svg'
    ]

    // Verify crawlers can fetch the page, directives, and key assets without authentication.
    await Promise.all(
        publicPaths.map(async (publicPath) => {
            const response = await fetch(`${baseUrl}${publicPath}`)
            assert.equal(response.status, 200, publicPath)
        })
    )
})
