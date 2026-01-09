import assert from 'node:assert/strict'
import test from 'node:test'
import { DtmfPlayer } from '../src/js/audio/DtmfPlayer.mjs'

class StubAudioContext {
    static instances = []

    constructor() {
        this.state = 'suspended'
        this.currentTime = 0
        this.destination = {}
        this.calls = {
            resume: 0,
            createOscillator: 0,
            start: 0,
            stop: 0
        }
        StubAudioContext.instances.push(this)
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
            start: () => {
                this.calls.start += 1
            },
            stop: () => {
                this.calls.stop += 1
            }
        }
    }
}

test('playKey uses two oscillators', async () => {
    const originalWindow = globalThis.window
    StubAudioContext.instances = []
    globalThis.window = { AudioContext: StubAudioContext }

    try {
        const player = new DtmfPlayer()
        await player.playKey('1', 1)

        const ctx = StubAudioContext.instances[0]
        assert.ok(ctx)
        assert.equal(ctx.calls.createOscillator, 2)
        assert.ok(ctx.calls.start >= 2)
        assert.ok(ctx.calls.stop >= 2)
        assert.ok(ctx.calls.resume >= 1)
    } finally {
        globalThis.window = originalWindow
    }
})

test('beep uses a single oscillator', async () => {
    const originalWindow = globalThis.window
    StubAudioContext.instances = []
    globalThis.window = { AudioContext: StubAudioContext }

    try {
        const player = new DtmfPlayer()
        await player.beep(440, 1)

        const ctx = StubAudioContext.instances[0]
        assert.ok(ctx)
        assert.equal(ctx.calls.createOscillator, 1)
        assert.ok(ctx.calls.start >= 1)
        assert.ok(ctx.calls.stop >= 1)
    } finally {
        globalThis.window = originalWindow
    }
})
