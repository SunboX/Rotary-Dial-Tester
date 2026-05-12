// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'

const serverScriptPath = path.join(process.cwd(), 'server.mjs')

/**
 * Reserves an ephemeral TCP port so startup collision behavior can be tested.
 * @returns {Promise<net.Server>}
 */
async function reserveEphemeralPort() {
    const blockingServer = net.createServer()

    await new Promise((resolve, reject) => {
        const handleError = (error) => {
            reject(error)
        }

        blockingServer.once('error', handleError)
        blockingServer.listen(0, () => {
            blockingServer.off('error', handleError)
            resolve()
        })
    })

    return blockingServer
}

/**
 * Closes a TCP server when it is still listening.
 * @param {net.Server} serverToClose
 * @returns {Promise<void>}
 */
async function closeServer(serverToClose) {
    await new Promise((resolve) => {
        if (!serverToClose.listening) {
            resolve()
            return
        }

        serverToClose.close(() => {
            resolve()
        })
    })
}

/**
 * Waits until a spawned server writes its listening message.
 * @param {import('node:child_process').ChildProcess} serverProcess
 * @returns {Promise<string>}
 */
async function waitForListeningMessage(serverProcess) {
    let stdoutOutput = ''

    return await new Promise((resolve, reject) => {
        serverProcess.stdout.setEncoding('utf8')
        serverProcess.stdout.on('data', (chunk) => {
            stdoutOutput += chunk
            if (stdoutOutput.includes('Web server is listening on port')) {
                resolve(stdoutOutput)
            }
        })
        serverProcess.once('error', reject)
        serverProcess.once('exit', (code) => {
            reject(new Error(`Server exited before listening with code ${code}.`))
        })
    })
}

/**
 * Verifies startup fails fast with actionable guidance when the port is occupied.
 * @returns {Promise<void>}
 */
test('server exits when configured port is already in use', { timeout: 5000 }, async (context) => {
    const blockingServer = await reserveEphemeralPort()
    const blockingAddress = blockingServer.address()

    assert.ok(blockingAddress)
    assert.equal(typeof blockingAddress, 'object')

    const blockedPort = blockingAddress.port
    let serverProcess = null

    context.after(async () => {
        if (serverProcess && serverProcess.exitCode === null) {
            serverProcess.kill('SIGKILL')
        }

        await closeServer(blockingServer)
    })

    serverProcess = spawn(process.execPath, [serverScriptPath], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(blockedPort) },
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let stderrOutput = ''
    serverProcess.stderr.setEncoding('utf8')
    serverProcess.stderr.on('data', (chunk) => {
        stderrOutput += chunk
    })

    const [exitCode, signal] = await once(serverProcess, 'exit')

    assert.equal(signal, null)
    assert.equal(exitCode, 1)
    assert.match(stderrOutput, /port \d+ is already in use\./i)
    assert.match(stderrOutput, /PORT=<free-port> npm start/)
    assert.doesNotMatch(stderrOutput, /Node NOT Exiting/)
})

/**
 * Verifies the local server exposes package metadata for the footer version loader.
 * @returns {Promise<void>}
 */
test('server exposes package.json for runtime version display', { timeout: 5000 }, async (context) => {
    const blockingServer = await reserveEphemeralPort()
    const serverAddress = blockingServer.address()

    assert.ok(serverAddress)
    assert.equal(typeof serverAddress, 'object')

    const port = serverAddress.port
    await closeServer(blockingServer)

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

    await waitForListeningMessage(serverProcess)

    const response = await fetch(`http://127.0.0.1:${port}/package.json`)
    const expectedPackageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'))
    const servedPackageJson = await response.json()

    assert.equal(response.status, 200)
    assert.equal(servedPackageJson.name, expectedPackageJson.name)
    assert.equal(servedPackageJson.version, expectedPackageJson.version)
})
