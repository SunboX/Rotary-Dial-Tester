import { WEB_SERIAL_MISSING_CODE, WEB_SERIAL_USER_ACTION_REQUIRED_CODE } from '../serial/SerialManager.mjs'

/**
 * Creates a successful MCP tool response with plain text and structured payload.
 * @param {string} message
 * @param {Record<string, unknown>} [data]
 * @returns {import('./types.mjs').ToolResponseLike}
 */
export function createToolSuccess(message, data = {}) {
    return {
        content: [{ type: 'text', text: message }],
        structuredContent: {
            ok: true,
            ...data
        }
    }
}

/**
 * Creates a failed MCP tool response with machine-readable code and retry hint.
 * @param {unknown} err
 * @param {{ fallbackCode?: string }} [options]
 * @returns {import('./types.mjs').ToolResponseLike}
 */
export function createToolFailure(err, options = {}) {
    const code = resolveErrorCode(err, options.fallbackCode || 'UNKNOWN_ERROR')
    const message = resolveErrorMessage(err)
    const retryHint = resolveRetryHint(code)

    return {
        content: [{ type: 'text', text: `${message}${retryHint ? ` ${retryHint}` : ''}` }],
        structuredContent: {
            ok: false,
            error: {
                code,
                message,
                retryHint
            }
        },
        isError: true
    }
}

/**
 * Resolves a stable error code from arbitrary thrown values.
 * @param {unknown} err
 * @param {string} fallbackCode
 * @returns {string}
 */
function resolveErrorCode(err, fallbackCode) {
    if (typeof err?.code === 'string' && err.code) return err.code
    return fallbackCode
}

/**
 * Resolves a user-facing error message from arbitrary thrown values.
 * @param {unknown} err
 * @returns {string}
 */
function resolveErrorMessage(err) {
    if (err instanceof Error && err.message) return err.message
    if (typeof err === 'string' && err) return err
    return 'Unknown error'
}

/**
 * Maps known error codes to actionable retry guidance.
 * @param {string} code
 * @returns {string}
 */
function resolveRetryHint(code) {
    if (code === WEB_SERIAL_MISSING_CODE) {
        return 'Use Chrome/Edge over https:// or localhost.'
    }
    if (code === WEB_SERIAL_USER_ACTION_REQUIRED_CODE) {
        return 'Perform one manual connect action in the page, then retry.'
    }
    return ''
}
