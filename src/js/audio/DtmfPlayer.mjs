import { sleep } from '../utils/sleep.mjs'

/**
 * DTMF player via WebAudio (no WAV needed).
 * Mapping: 1-9, 0, *, #
 */
export class DtmfPlayer {
    /** @type {AudioContext|null} */
    #ctx = null

    /**
     * Lazily creates and returns the AudioContext instance.
     * @returns {AudioContext}
     */
    get ctx() {
        if (!this.#ctx) this.#ctx = new (window.AudioContext || window.webkitAudioContext)()
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
        if (!pair) return this.beep(450, ms)

        const ctx = this.ctx
        if (ctx.state === 'suspended') await ctx.resume()

        const now = ctx.currentTime
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)

        const o1 = ctx.createOscillator()
        const o2 = ctx.createOscillator()
        o1.type = 'sine'
        o2.type = 'sine'
        o1.frequency.setValueAtTime(pair[0], now)
        o2.frequency.setValueAtTime(pair[1], now)

        o1.connect(gain)
        o2.connect(gain)
        gain.connect(ctx.destination)

        o1.start(now)
        o2.start(now)
        o1.stop(now + ms / 1000)
        o2.stop(now + ms / 1000)

        await sleep(ms)
    }

    /**
     * Plays a single tone for the given duration.
     * @param {number} freq
     * @param {number} ms
     * @returns {Promise<void>}
     */
    async beep(freq = 450, ms = 200) {
        const ctx = this.ctx
        if (ctx.state === 'suspended') await ctx.resume()

        const now = ctx.currentTime
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)

        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(freq, now)
        o.connect(gain)
        gain.connect(ctx.destination)
        o.start(now)
        o.stop(now + ms / 1000)

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
