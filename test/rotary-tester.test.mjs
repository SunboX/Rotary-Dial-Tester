import assert from 'node:assert/strict'
import test from 'node:test'
import { RotaryTester } from '../src/js/measurement/RotaryTester.mjs'

test('start continues when DCD is low', async () => {
    const warnings = []
    const serial = {
        isOpen: true,
        async getSignals() {
            return {
                dataCarrierDetect: false,
                dataSetReady: false,
                ringIndicator: false
            }
        }
    }

    const tester = new RotaryTester({
        serial,
        onSignals: () => {},
        onCycle: () => {},
        onWarn: (msg) => warnings.push(msg)
    })

    tester._loop = async () => {}

    await tester.start()

    assert.equal(tester.running, true)
    assert.equal(warnings.length, 1)
    tester.stop()
})

test('_computeCycle calculates pulse metrics', () => {
    const serial = {
        isOpen: true,
        async getSignals() {
            return {}
        }
    }

    const tester = new RotaryTester({
        serial,
        onSignals: () => {},
        onCycle: () => {},
        onWarn: () => {}
    })

    tester.nsiTimes = [0, 50, 100, 150, 200, 250]
    tester.nsaTimes = [120, 180]
    tester.nsrTimes = [80]

    const cycle = tester._computeCycle()

    assert.equal(cycle.pulses, 3)
    assert.equal(cycle.digit, 3)
    assert.equal(cycle.fHz, 10)
    assert.equal(cycle.dutyClosed, 50)
    assert.equal(cycle.nsaOpenMs, 180)
    assert.equal(cycle.nsrOnMs, 80)
    assert.equal(cycle.warnings.length, 0)
})
