import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocale, setLocale, t } from '../src/js/i18n.mjs'

/**
 * Verifies translations resolve in English and German with interpolation.
 * @returns {void}
 */
test('i18n resolves localized strings', () => {
    const originalLocale = getLocale()
    setLocale('en')
    assert.equal(t('controls.start'), 'Start Test')
    setLocale('de')
    assert.equal(t('controls.start'), 'Test starten')
    assert.equal(t('pulseStrip.dotTitle', { count: 3 }), 'Impuls 3')
    setLocale(originalLocale)
})
