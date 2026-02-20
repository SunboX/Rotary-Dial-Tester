import { sleep } from '../utils/sleep.mjs'

/**
 * Supported DTMF playback modes.
 * @typedef {'auto'|'worklet'|'oscillator'} DtmfAudioMode
 */

/**
 * DTMF player via WebAudio with optional AudioWorklet acceleration.
 * Mapping: 1-9, 0, *, #
 */
export class DtmfPlayer {
    /** @type {AudioContext|null} */
    #ctx = null

    /** @type {AudioWorkletNode|null} */
    #workletNode = null

    /** @type {Promise<AudioWorkletNode>|null} */
    #workletInitPromise = null

    /** @type {DtmfAudioMode} */
    #audioMode

    /** @type {boolean} */
    #workletDisabledForSession = false

    /** @type {boolean} */
    #didLogWorkletFallback = false

    /**
     * @param {object} [options]
     * @param {DtmfAudioMode} [options.audioMode='auto']
     */
    constructor(options = {}) {
        const mode = String(options.audioMode || 'auto')
        if (mode === 'worklet' || mode === 'oscillator' || mode === 'auto') {
            this.#audioMode = mode
        } else {
            this.#audioMode = 'auto'
        }
    }

    /**
     * Lazily creates and returns the AudioContext instance.
     * @returns {AudioContext}
     */
    get ctx() {
        if (!this.#ctx) {
            this.#ctx = new (window.AudioContext || window.webkitAudioContext)()
        }
        return this.#ctx
    }

    /**
     * Plays a DTMF key tone for the given duration.
     * @param {string} key e.g. "1".."9","0","*","#"
     * @param {number} ms duration
     * @returns {Promise<void>}
     */
    async playKey(key, ms = 200) {
        const pair = dtmfFreqs(key)
        if (!pair) {
            await this.beep(450, ms)
            return
        }

        if (await this.#shouldUseWorklet()) {
            await this.#playViaWorklet({
                type: 'playKey',
                freqA: pair[0],
                freqB: pair[1],
                durationMs: ms,
                gain: 0.15
            })
            return
        }

        await this.#playKeyOscillator(pair[0], pair[1], ms)
    }

    /**
     * Plays a single tone for the given duration.
     * @param {number} freq
     * @param {number} ms
     * @returns {Promise<void>}
     */
    async beep(freq = 450, ms = 200) {
        if (await this.#shouldUseWorklet()) {
            await this.#playViaWorklet({
                type: 'beep',
                freq,
                durationMs: ms,
                gain: 0.12
            })
            return
        }

        await this.#beepOscillator(freq, ms)
    }

    /**
     * Determines whether playback should use the AudioWorklet path.
     * @returns {Promise<boolean>}
     */
    async #shouldUseWorklet() {
        if (this.#audioMode === 'oscillator') return false
        if (this.#audioMode === 'auto' && this.#workletDisabledForSession) return false

        try {
            await this.#ensureWorkletNode()
            return true
        } catch (error) {
            if (this.#audioMode === 'worklet') {
                throw error
            }

            this.#workletDisabledForSession = true
            if (!this.#didLogWorkletFallback) {
                this.#didLogWorkletFallback = true
                console.warn('DTMF AudioWorklet unavailable. Falling back to OscillatorNode playback.', error)
            }
            return false
        }
    }

    /**
     * Ensures an active worklet node exists and is connected.
     * @returns {Promise<AudioWorkletNode>}
     */
    async #ensureWorkletNode() {
        if (this.#workletNode) return this.#workletNode
        if (this.#workletInitPromise) return await this.#workletInitPromise

        this.#workletInitPromise = this.#createWorkletNode()

        try {
            this.#workletNode = await this.#workletInitPromise
            return this.#workletNode
        } finally {
            this.#workletInitPromise = null
        }
    }

    /**
     * Creates and returns a new DTMF AudioWorklet node.
     * @returns {Promise<AudioWorkletNode>}
     */
    async #createWorkletNode() {
        const ctx = this.ctx
        if (ctx.state === 'suspended') {
            await ctx.resume()
        }

        if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') {
            throw new Error('AudioWorklet API is not available in this browser.')
        }

        if (typeof AudioWorkletNode === 'undefined') {
            throw new Error('AudioWorkletNode is not available in this browser.')
        }

        await ctx.audioWorklet.addModule(new URL('./DtmfWorkletProcessor.mjs', import.meta.url))

        const node = new AudioWorkletNode(ctx, 'dtmf-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1]
        })

        node.connect(ctx.destination)
        return node
    }

    /**
     * Posts one playback command to the worklet and waits for completion.
     * @param {object} command
     * @param {number} [command.freqA]
     * @param {number} [command.freqB]
     * @param {number} [command.freq]
     * @param {number} command.durationMs
     * @param {number} command.gain
     * @returns {Promise<void>}
     */
    async #playViaWorklet(command) {
        const node = await this.#ensureWorkletNode()
        node.port.postMessage(command)
        await sleep(command.durationMs)
    }

    /**
     * Plays a dual-tone DTMF signal with oscillator nodes.
     * @param {number} freqA
     * @param {number} freqB
     * @param {number} ms
     * @returns {Promise<void>}
     */
    async #playKeyOscillator(freqA, freqB, ms) {
        const ctx = this.ctx
        if (ctx.state === 'suspended') await ctx.resume()

        const now = ctx.currentTime
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)

        const oscA = ctx.createOscillator()
        const oscB = ctx.createOscillator()
        oscA.type = 'sine'
        oscB.type = 'sine'
        oscA.frequency.setValueAtTime(freqA, now)
        oscB.frequency.setValueAtTime(freqB, now)

        oscA.connect(gain)
        oscB.connect(gain)
        gain.connect(ctx.destination)

        oscA.start(now)
        oscB.start(now)
        oscA.stop(now + ms / 1000)
        oscB.stop(now + ms / 1000)

        await sleep(ms)
    }

    /**
     * Plays a single-frequency tone with oscillator nodes.
     * @param {number} freq
     * @param {number} ms
     * @returns {Promise<void>}
     */
    async #beepOscillator(freq, ms) {
        const ctx = this.ctx
        if (ctx.state === 'suspended') await ctx.resume()

        const now = ctx.currentTime
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)

        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + ms / 1000)

        await sleep(ms)
    }
}

/**
 * Returns the frequency pair for a DTMF key.
 * @param {string} key
 * @returns {number[]|null}
 */
function dtmfFreqs(key) {
    const map = {
        1: [697, 1209],
        2: [697, 1336],
        3: [697, 1477],
        4: [770, 1209],
        5: [770, 1336],
        6: [770, 1477],
        7: [852, 1209],
        8: [852, 1336],
        9: [852, 1477],
        '*': [941, 1209],
        0: [941, 1336],
        '#': [941, 1477]
    }

    return map[key] || null
}
