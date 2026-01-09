/**
 * Pads a number to two characters with a leading zero.
 * @param {number} n
 * @returns {string}
 */
export function pad2(n) {
    return String(n).padStart(2, '0')
}

/**
 * Formats a date/time as "DD.MM.YYYY  HH:MM:SS".
 * @param {Date} [d]
 * @returns {string}
 */
export function formatDateTime(d = new Date()) {
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}  ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/**
 * Clamps a value between min and max.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
}
