import assert from 'node:assert/strict'
import test from 'node:test'
import { composeStripImage, downloadBlob, downloadCanvas, printBlob, printCanvas } from '../src/js/export.mjs'

/**
 * Creates a mock 2D context for canvas operations.
 * @returns {object}
 */
function createMockContext() {
    return {
        fillRect() {},
        drawImage() {}
    }
}

/**
 * Creates a mock canvas element.
 * @param {number} width
 * @param {number} height
 * @returns {object}
 */
function createMockCanvas(width = 10, height = 10) {
    const ctx = createMockContext()
    return {
        width,
        height,
        getContext() {
            return ctx
        },
        toDataURL() {
            return 'data:image/png;base64,TEST'
        }
    }
}

test('composeStripImage returns null for empty input', () => {
    const originalDocument = globalThis.document
    globalThis.document = {
        createElement() {
            return createMockCanvas()
        }
    }

    try {
        const result = composeStripImage([])
        assert.equal(result, null)
    } finally {
        globalThis.document = originalDocument
    }
})

test('composeStripImage builds a combined canvas', () => {
    const originalDocument = globalThis.document
    globalThis.document = {
        createElement() {
            return createMockCanvas(100, 50)
        }
    }

    try {
        const canvases = [createMockCanvas(100, 50), createMockCanvas(100, 50)]
        const result = composeStripImage(canvases, { margin: 10 })

        assert.ok(result)
        assert.equal(result.width, 120)
        assert.equal(result.height, 130)
    } finally {
        globalThis.document = originalDocument
    }
})

test('downloadCanvas creates and clicks an anchor', () => {
    const originalDocument = globalThis.document
    const clicked = { count: 0 }

    globalThis.document = {
        createElement(tag) {
            if (tag === 'a') {
                return {
                    href: '',
                    download: '',
                    click() {
                        clicked.count += 1
                    },
                    remove() {}
                }
            }
            return createMockCanvas()
        },
        body: {
            appendChild() {}
        }
    }

    try {
        downloadCanvas(createMockCanvas(), 'diagram.png')
        assert.equal(clicked.count, 1)
    } finally {
        globalThis.document = originalDocument
    }
})

test('printCanvas writes a print document', () => {
    const originalWindow = globalThis.window
    let written = ''

    globalThis.window = {
        open() {
            return {
                document: {
                    write(html) {
                        written = html
                    },
                    close() {}
                }
            }
        }
    }

    try {
        printCanvas(createMockCanvas())
        assert.ok(written.includes('<img'))
        assert.ok(written.includes('Print'))
    } finally {
        globalThis.window = originalWindow
    }
})

/**
 * Ensures blob downloads create object URLs and click temporary anchors.
 * @returns {void}
 */
test('downloadBlob creates object URL and clicks an anchor', () => {
    const originalDocument = globalThis.document
    const originalUrl = globalThis.URL
    const clicked = { count: 0 }
    const urls = { created: [], revoked: [] }

    globalThis.URL = {
        createObjectURL(blob) {
            urls.created.push(blob)
            return 'blob:mock'
        },
        revokeObjectURL(url) {
            urls.revoked.push(url)
        }
    }

    globalThis.document = {
        createElement(tag) {
            if (tag === 'a') {
                return {
                    href: '',
                    download: '',
                    click() {
                        clicked.count += 1
                    },
                    remove() {}
                }
            }
            return createMockCanvas()
        },
        body: {
            appendChild() {}
        }
    }

    try {
        downloadBlob(new Blob(['download']), 'diagram.png')
        assert.equal(clicked.count, 1)
        assert.equal(urls.created.length, 1)
        assert.deepEqual(urls.revoked, ['blob:mock'])
    } finally {
        globalThis.document = originalDocument
        globalThis.URL = originalUrl
    }
})

/**
 * Ensures blob printing uses object URLs and revokes them after print window setup.
 * @returns {void}
 */
test('printBlob writes a print document from blob URL', () => {
    const originalWindow = globalThis.window
    const originalUrl = globalThis.URL
    let written = ''
    const revoked = []

    globalThis.URL = {
        createObjectURL() {
            return 'blob:print-mock'
        },
        revokeObjectURL(url) {
            revoked.push(url)
        }
    }

    globalThis.window = {
        open() {
            return {
                document: {
                    write(html) {
                        written = html
                    },
                    close() {}
                }
            }
        }
    }

    try {
        printBlob(new Blob(['print']))
        assert.ok(written.includes('blob:print-mock'))
        assert.deepEqual(revoked, ['blob:print-mock'])
    } finally {
        globalThis.window = originalWindow
        globalThis.URL = originalUrl
    }
})
