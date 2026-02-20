import process from 'node:process'
import express from 'express'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const DEFAULT_PORT = 8080

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)
const port = resolvePort(process.env.PORT)

configureApp(app, __dirname)
registerServerErrorHandling(server, port)
startServer(server, port)

/**
 * Configures the express instance and static asset hosting.
 * @param {import('express').Express} expressApp
 * @param {string} rootDir
 * @returns {void}
 */
function configureApp(expressApp, rootDir) {
    expressApp.set('etag', false)

    expressApp.get('/service-worker.js', (req, res, next) => {
        // Keep the service worker script fresh to avoid stale runtime caches.
        res.setHeader('Cache-Control', 'no-store')
        next()
    })

    expressApp.use(
        '/',
        express.static(path.join(rootDir, 'src'), {
            index: ['index.html'],
            etag: false,
            maxAge: '0' // uses milliseconds per docs
        })
    )
}

/**
 * Parses a numeric port from configuration and falls back to the default.
 * @param {string | undefined} configuredPort
 * @returns {number}
 */
function resolvePort(configuredPort) {
    const parsedPort = Number.parseInt(configuredPort ?? '', 10)

    if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        return parsedPort
    }

    return DEFAULT_PORT
}

/**
 * Registers startup error handling for listen failures.
 * @param {import('http').Server} httpServer
 * @param {number} configuredPort
 * @returns {void}
 */
function registerServerErrorHandling(httpServer, configuredPort) {
    httpServer.on('error', (error) => {
        handleListenError(error, configuredPort)
    })
}

/**
 * Handles listen errors with a clear message and non-zero exit code.
 * @param {NodeJS.ErrnoException} error
 * @param {number} configuredPort
 * @returns {never}
 */
function handleListenError(error, configuredPort) {
    if (error.code === 'EADDRINUSE') {
        console.error(`Cannot start server: port ${configuredPort} is already in use.`)
        console.error('Stop the other process or run with PORT=<free-port> npm start.')
        process.exit(1)
    }

    console.error('Cannot start server due to an unexpected listen error.')
    console.error(error)
    process.exit(1)
}

/**
 * Starts the HTTP server and logs the active port.
 * @param {import('http').Server} httpServer
 * @param {number} configuredPort
 * @returns {void}
 */
function startServer(httpServer, configuredPort) {
    httpServer.listen(configuredPort, () => {
        console.log(`Web server is listening on port ${configuredPort}`)
    })
}
