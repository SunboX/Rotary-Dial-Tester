/**
 * Provides the minimum IdleDeadline fields used by the app.
 * @typedef {{ didTimeout: boolean, timeRemaining: () => number }} IdleDeadlineLike
 */

/**
 * Returns a high-resolution clock function when available.
 * @returns {() => number}
 */
function getNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return () => performance.now()
    }
    return () => Date.now()
}

/**
 * Schedules low-priority work with requestIdleCallback and falls back to setTimeout.
 * @param {(deadline: IdleDeadlineLike) => void} work
 * @param {object} [options]
 * @param {number} [options.timeout=250]
 * @param {number} [options.fallbackBudgetMs=8]
 * @returns {() => void}
 */
export function scheduleIdle(work, options = {}) {
    const timeout = Math.max(1, Number(options.timeout) || 250)
    const fallbackBudgetMs = Math.max(1, Number(options.fallbackBudgetMs) || 8)

    if (typeof globalThis.requestIdleCallback === 'function') {
        const idleId = globalThis.requestIdleCallback(work, { timeout })
        return () => {
            if (typeof globalThis.cancelIdleCallback === 'function') {
                globalThis.cancelIdleCallback(idleId)
            }
        }
    }

    const now = getNow()
    const timeoutId = setTimeout(() => {
        const startedAt = now()
        work({
            didTimeout: true,
            timeRemaining: () => Math.max(0, fallbackBudgetMs - (now() - startedAt))
        })
    }, 1)

    return () => {
        clearTimeout(timeoutId)
    }
}
