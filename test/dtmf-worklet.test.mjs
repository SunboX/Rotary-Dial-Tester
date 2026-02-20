import assert from 'node:assert/strict'
import test from 'node:test'
import { DtmfPlayer } from '../src/js/audio/DtmfPlayer.mjs'

class WorkletCapableAudioContext {
    static instances = []

    constructor({ failAddModule = false } = {}) {
        this.state = 'suspended'
        this.currentTime = 0
        this.destination = {}
        this.failAddModule = failAddModule
        this.calls = {
            resume: 0,
            addModule: 0,
            createOscillator: 0
        }
        this.audioWorklet = {
            addModule: async () => {
                this.calls.addModule += 1
                if (this.failAddModule) {
                    throw new Error('module load failed')
                }
            }
        }

        WorkletCapableAudioContext.instances.push(this)
    }

    async resume() {
        this.state = 'running'
        this.calls.resume += 1
    }

    createGain() {
        return {
            gain: {
                setValueAtTime() {},
                exponentialRampToValueAtTime() {}
            },
            connect() {}
        }
    }

    createOscillator() {
        this.calls.createOscillator += 1
        return {
            type: 'sine',
            frequency: {
                setValueAtTime() {}
            },
            connect() {},
            start() {},
            stop() {}
        }
    }
}

/**
 * Creates a minimal AudioWorkletNode stub for tests.
 */
class StubAudioWorkletNode {
    static instances = []

    constructor(_ctx, _name) {
        this.connected = false
        this.messages = []
        this.port = {
            postMessage: (message) => {
                this.messages.push(message)
            }
        }
        StubAudioWorkletNode.instances.push(this)
    }

    connect() {
        this.connected = true
    }
}

/**
 * Verifies auto mode uses AudioWorklet when available.
 * @returns {Promise<void>}
 */
test('DtmfPlayer auto mode uses AudioWorklet when supported', async () => {
    const originalWindow = globalThis.window
    const originalAudioWorkletNode = globalThis.AudioWorkletNode

    WorkletCapableAudioContext.instances = []
    StubAudioWorkletNode.instances = []

    globalThis.window = {
        AudioContext: class extends WorkletCapableAudioContext {
            constructor() {
                super({ failAddModule: false })
            }
        }
    }
    globalThis.AudioWorkletNode = StubAudioWorkletNode

    try {
        const player = new DtmfPlayer({ audioMode: 'auto' })
        await player.playKey('5', 1)

        const ctx = WorkletCapableAudioContext.instances[0]
        assert.ok(ctx)
        assert.equal(ctx.calls.addModule, 1)
        assert.equal(ctx.calls.createOscillator, 0)

        const node = StubAudioWorkletNode.instances[0]
        assert.ok(node)
        assert.equal(node.connected, true)
        assert.equal(node.messages.length, 1)
        assert.equal(node.messages[0].type, 'playKey')
    } finally {
        globalThis.window = originalWindow
        globalThis.AudioWorkletNode = originalAudioWorkletNode
    }
})

/**
 * Verifies auto mode falls back to oscillators if worklet initialization fails.
 * @returns {Promise<void>}
 */
test('DtmfPlayer auto mode falls back to oscillator after worklet failure', async () => {
    const originalWindow = globalThis.window
    const originalAudioWorkletNode = globalThis.AudioWorkletNode

    WorkletCapableAudioContext.instances = []
    StubAudioWorkletNode.instances = []

    globalThis.window = {
        AudioContext: class extends WorkletCapableAudioContext {
            constructor() {
                super({ failAddModule: true })
            }
        }
    }
    globalThis.AudioWorkletNode = StubAudioWorkletNode

    try {
        const player = new DtmfPlayer({ audioMode: 'auto' })
        await player.beep(440, 1)
        await player.beep(440, 1)

        const ctx = WorkletCapableAudioContext.instances[0]
        assert.ok(ctx)
        assert.equal(ctx.calls.addModule, 1)
        assert.ok(ctx.calls.createOscillator >= 2)
    } finally {
        globalThis.window = originalWindow
        globalThis.AudioWorkletNode = originalAudioWorkletNode
    }
})

/**
 * Verifies oscillator mode bypasses worklet initialization entirely.
 * @returns {Promise<void>}
 */
test('DtmfPlayer oscillator mode bypasses AudioWorklet', async () => {
    const originalWindow = globalThis.window
    const originalAudioWorkletNode = globalThis.AudioWorkletNode

    WorkletCapableAudioContext.instances = []
    StubAudioWorkletNode.instances = []

    globalThis.window = {
        AudioContext: class extends WorkletCapableAudioContext {
            constructor() {
                super({ failAddModule: false })
            }
        }
    }
    globalThis.AudioWorkletNode = StubAudioWorkletNode

    try {
        const player = new DtmfPlayer({ audioMode: 'oscillator' })
        await player.playKey('3', 1)

        const ctx = WorkletCapableAudioContext.instances[0]
        assert.ok(ctx)
        assert.equal(ctx.calls.addModule, 0)
        assert.ok(ctx.calls.createOscillator >= 2)
    } finally {
        globalThis.window = originalWindow
        globalThis.AudioWorkletNode = originalAudioWorkletNode
    }
})
