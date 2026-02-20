/**
 * A single active one-shot tone rendered by the DTMF worklet.
 * @typedef {{
 *   freqA: number,
 *   freqB: number|null,
 *   gain: number,
 *   startFrame: number,
 *   endFrame: number,
 *   fadeInFrames: number,
 *   fadeOutFrames: number,
 *   phaseA: number,
 *   phaseB: number
 * }} ActiveTone
 */

/**
 * AudioWorklet processor that renders one-shot DTMF/beep tones.
 */
class DtmfWorkletProcessor extends AudioWorkletProcessor {
    /**
     * Creates a new processor instance and wires control-message handling.
     */
    constructor() {
        super()

        /**
         * Currently active tones.
         * @type {Array<ActiveTone>}
         */
        this.activeTones = []

        /**
         * Monotonic frame counter used for timing envelopes.
         * @type {number}
         */
        this.frameCursor = 0

        this.port.onmessage = (event) => {
            this.#handleCommand(event?.data)
        }
    }

    /**
     * Receives tone commands and schedules a one-shot voice.
     * @param {unknown} rawCommand
     * @returns {void}
     */
    #handleCommand(rawCommand) {
        if (!rawCommand || typeof rawCommand !== 'object') return

        const command = /** @type {{ type?: string, freqA?: number, freqB?: number, freq?: number, durationMs?: number, gain?: number }} */ (rawCommand)
        const durationMs = Math.max(1, Number(command.durationMs) || 200)
        const gain = Math.max(0, Math.min(1, Number(command.gain) || 0.12))

        let freqA = Number(command.freqA)
        let freqB = command.freqB == null ? null : Number(command.freqB)

        if (command.type === 'beep') {
            freqA = Number(command.freq)
            freqB = null
        }

        if (!Number.isFinite(freqA) || freqA <= 0) return
        if (freqB != null && (!Number.isFinite(freqB) || freqB <= 0)) {
            freqB = null
        }

        const durationFrames = Math.max(1, Math.floor((durationMs / 1000) * sampleRate))
        const fadeInFrames = Math.max(1, Math.floor(sampleRate * 0.01))
        const fadeOutFrames = Math.max(1, Math.floor(sampleRate * 0.01))

        this.activeTones.push({
            freqA,
            freqB,
            gain,
            startFrame: this.frameCursor,
            endFrame: this.frameCursor + durationFrames,
            fadeInFrames,
            fadeOutFrames,
            phaseA: 0,
            phaseB: 0
        })
    }

    /**
     * Renders outgoing samples for the current audio block.
     * @param {Array<Float32Array>} outputChannels
     * @returns {void}
     */
    #renderBlock(outputChannels) {
        const frameCount = outputChannels[0]?.length || 0
        if (frameCount === 0) return

        for (let frame = 0; frame < frameCount; frame++) {
            const absoluteFrame = this.frameCursor + frame
            let mixedSample = 0

            for (let i = this.activeTones.length - 1; i >= 0; i--) {
                const tone = this.activeTones[i]

                if (absoluteFrame >= tone.endFrame) {
                    this.activeTones.splice(i, 1)
                    continue
                }

                const elapsedFrames = absoluteFrame - tone.startFrame
                if (elapsedFrames < 0) continue

                const remainingFrames = tone.endFrame - absoluteFrame
                const attack = Math.min(1, elapsedFrames / tone.fadeInFrames)
                const release = Math.min(1, remainingFrames / tone.fadeOutFrames)
                const envelope = Math.min(attack, release)

                tone.phaseA += (2 * Math.PI * tone.freqA) / sampleRate
                if (tone.phaseA > 2 * Math.PI) tone.phaseA -= 2 * Math.PI

                let voiceSample = Math.sin(tone.phaseA)
                if (tone.freqB != null) {
                    tone.phaseB += (2 * Math.PI * tone.freqB) / sampleRate
                    if (tone.phaseB > 2 * Math.PI) tone.phaseB -= 2 * Math.PI
                    voiceSample = 0.5 * (voiceSample + Math.sin(tone.phaseB))
                }

                mixedSample += voiceSample * tone.gain * envelope
            }

            const clipped = Math.max(-1, Math.min(1, mixedSample))
            for (let ch = 0; ch < outputChannels.length; ch++) {
                outputChannels[ch][frame] = clipped
            }
        }

        this.frameCursor += frameCount
    }

    /**
     * Processes one WebAudio render quantum.
     * @param {Array<Array<Float32Array>>} _inputs
     * @param {Array<Array<Float32Array>>} outputs
     * @returns {boolean}
     */
    process(_inputs, outputs) {
        const output = outputs[0]
        if (!output || output.length === 0) {
            return true
        }

        this.#renderBlock(output)
        return true
    }
}

registerProcessor('dtmf-processor', DtmfWorkletProcessor)
