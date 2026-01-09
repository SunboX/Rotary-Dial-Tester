import assert from 'node:assert/strict'
import test from 'node:test'
import { sleep } from '../src/js/utils/sleep.mjs'

test('sleep returns a thenable and resolves', async () => {
    const promise = sleep(1)
    assert.equal(typeof promise.then, 'function')
    await promise
})
