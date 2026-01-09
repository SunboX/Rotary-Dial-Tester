import process from 'node:process'
import express from 'express'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)

process.on('uncaughtException', function (err) {
    console.error(err)
    console.log('Node NOT Exiting...')
})

server.listen(8080, function () {
    console.log('Webserver läuft und hört auf Port 8080')
})

app.set('etag', false)

app.use(
    '/',
    express.static(__dirname + '/src', {
        index: ['index.html'],
        etag: false,
        maxAge: '0' // uses milliseconds per docs
    })
)
