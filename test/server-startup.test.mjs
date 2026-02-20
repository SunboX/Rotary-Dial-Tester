import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
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
