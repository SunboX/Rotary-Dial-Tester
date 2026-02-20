import assert from 'node:assert/strict'
import test from 'node:test'
import { RotaryCycleEngine, WARNING_KEYS } from '../src/js/measurement/RotaryCycleEngine.mjs'

/**
 * Verifies initialization warns when DCD starts low.
 * @returns {void}
 */
test('initializeFromSignals returns nsi-open warning when DCD is low', () => {
    const engine = new RotaryCycleEngine({ nowMs: () => 0 })
    const result = engine.initializeFromSignals({
        dataCarrierDetect: false,
        dataSetReady: false,
        ringIndicator: false
    })

    assert.equal(result.warningKey, WARNING_KEYS.NSI_OPEN)
})

/**
 * Verifies cycle metric computation remains compatible with the previous tester logic.
 * @returns {void}
 */
test('computeCycle calculates expected metrics', () => {
    const engine = new RotaryCycleEngine({ nowMs: () => 0 })
    engine.nsiTimes = [0, 50, 100, 150, 200, 250]
    engine.nsaTimes = [120, 180]
    engine.nsrTimes = [80]

    const cycle = engine.computeCycle()

    assert.equal(cycle.pulses, 3)
    assert.equal(cycle.digit, 3)
    assert.equal(cycle.fHz, 10)
    assert.equal(cycle.dutyClosed, 50)
    assert.equal(cycle.nsaOpenMs, 180)
    assert.equal(cycle.nsrOnMs, 80)
    assert.equal(cycle.warnings.length, 0)
})

/**
 * Verifies finalize timing thresholds emit a cycle only after the configured idle window.
 * @returns {void}
 */
test('processStableSignals emits cycle once timing threshold is reached', () => {
    let nowMs = 0
    const engine = new RotaryCycleEngine({ nowMs: () => nowMs })

    engine.initializeFromSignals({
        dataCarrierDetect: true,
        dataSetReady: false,
        ringIndicator: false
    })

    nowMs = 50
    engine.processStableSignals({ dataCarrierDetect: false, dataSetReady: false, ringIndicator: false })
    nowMs = 100
    engine.processStableSignals({ dataCarrierDetect: true, dataSetReady: false, ringIndicator: false })
    nowMs = 150
    engine.processStableSignals({ dataCarrierDetect: false, dataSetReady: false, ringIndicator: false })
    nowMs = 200
    engine.processStableSignals({ dataCarrierDetect: true, dataSetReady: false, ringIndicator: false })

    nowMs = 350
    const finalize = engine.processStableSignals({ dataCarrierDetect: true, dataSetReady: false, ringIndicator: false })

    assert.ok(finalize.cycle)
    assert.equal(finalize.cycle.pulses, 2)
    assert.equal(finalize.cycle.fHz, 10)
})

/**
 * Verifies debounce values are clamped to the supported 0..10 range.
 * @returns {void}
 */
test('setDebounceMs clamps values to valid range', () => {
    const engine = new RotaryCycleEngine({ nowMs: () => 0 })

    engine.setDebounceMs(-4)
    assert.equal(engine.debounceMs, 0)

    engine.setDebounceMs(20)
    assert.equal(engine.debounceMs, 10)
})
