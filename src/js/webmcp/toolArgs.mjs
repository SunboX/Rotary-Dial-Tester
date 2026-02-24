const INVALID_ARGUMENT_CODE = 'INVALID_ARGUMENT'

/**
 * Creates a typed invalid-argument error that is preserved in WebMCP responses.
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function createInvalidArgumentError(message) {
    const error = new Error(message)
    error.code = INVALID_ARGUMENT_CODE
    return error
}

/**
 * Normalizes a tool input payload into an object.
 * @param {unknown} input
 * @param {string} toolName
 * @returns {Record<string, unknown>}
 */
export function requireToolInputObject(input, toolName) {
    if (input === undefined || input === null) {
        return {}
    }

    if (typeof input !== 'object' || Array.isArray(input)) {
        throw createInvalidArgumentError(`${toolName}: arguments must be a JSON object.`)
    }

    return /** @type {Record<string, unknown>} */ (input)
}

/**
 * Validates that the argument object contains only expected keys.
 * @param {Record<string, unknown>} args
 * @param {string} toolName
 * @param {Array<string>} allowedKeys
 * @returns {void}
 */
export function assertAllowedKeys(args, toolName, allowedKeys) {
    const unknownKeys = Object.keys(args).filter((key) => !allowedKeys.includes(key))
    if (unknownKeys.length === 0) return

    // Return explicit feedback so an agent can retry with corrected parameters.
    throw createInvalidArgumentError(
        `${toolName}: unknown argument(s): ${unknownKeys.join(', ')}. Allowed: ${allowedKeys.join(', ') || '(none)'}.`
    )
}

/**
 * Reads a boolean argument from arbitrary input.
 * @param {unknown} value
 * @param {object} options
 * @param {string} options.name
 * @param {boolean} [options.required=false]
 * @param {boolean} [options.defaultValue=false]
 * @returns {boolean}
 */
export function readBooleanArg(value, { name, required = false, defaultValue = false }) {
    if (value === undefined || value === null) {
        if (required) {
            throw createInvalidArgumentError(`${name} is required and must be a boolean.`)
        }
        return defaultValue
    }

    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false

    throw createInvalidArgumentError(`${name} must be a boolean.`)
}

/**
 * Reads a numeric argument and enforces optional range/integer constraints.
 * @param {unknown} value
 * @param {object} options
 * @param {string} options.name
 * @param {boolean} [options.required=false]
 * @param {number} [options.defaultValue=0]
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @param {boolean} [options.integer=false]
 * @returns {number}
 */
export function readNumberArg(value, { name, required = false, defaultValue = 0, min, max, integer = false }) {
    if (value === undefined || value === null || value === '') {
        if (required) {
            throw createInvalidArgumentError(`${name} is required and must be a number.`)
        }
        return defaultValue
    }

    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) {
        throw createInvalidArgumentError(`${name} must be a finite number.`)
    }

    if (integer && !Number.isInteger(numeric)) {
        throw createInvalidArgumentError(`${name} must be an integer.`)
    }

    if (typeof min === 'number' && numeric < min) {
        throw createInvalidArgumentError(`${name} must be >= ${min}.`)
    }

    if (typeof max === 'number' && numeric > max) {
        throw createInvalidArgumentError(`${name} must be <= ${max}.`)
    }

    return numeric
}

/**
 * Reads a string enum argument and validates membership.
 * @param {unknown} value
 * @param {object} options
 * @param {string} options.name
 * @param {Array<string>} options.values
 * @param {boolean} [options.required=false]
 * @param {string} [options.defaultValue='']
 * @returns {string}
 */
export function readEnumArg(value, { name, values, required = false, defaultValue = '' }) {
    if (value === undefined || value === null || value === '') {
        if (required) {
            throw createInvalidArgumentError(`${name} is required. Allowed values: ${values.join(', ')}.`)
        }
        return defaultValue
    }

    const text = String(value)
    if (values.includes(text)) return text

    throw createInvalidArgumentError(`${name} must be one of: ${values.join(', ')}.`)
}

/**
 * Reads a string argument and optionally trims/validates emptiness.
 * @param {unknown} value
 * @param {object} options
 * @param {string} options.name
 * @param {boolean} [options.required=false]
 * @param {string} [options.defaultValue='']
 * @param {boolean} [options.trim=true]
 * @param {boolean} [options.allowEmpty=false]
 * @returns {string}
 */
export function readStringArg(
    value,
    { name, required = false, defaultValue = '', trim = true, allowEmpty = false }
) {
    if (value === undefined || value === null) {
        if (required) {
            throw createInvalidArgumentError(`${name} is required and must be a string.`)
        }
        return defaultValue
    }

    const text = trim ? String(value).trim() : String(value)
    if (!allowEmpty && text.length === 0) {
        throw createInvalidArgumentError(`${name} must not be empty.`)
    }

    return text
}

