import assert from 'node:assert/strict'
import test from 'node:test'
import { initWebMcp } from '../src/js/webmcp/initWebMcp.mjs'

/**
 * Creates a minimal DOM mock for WebMCP initialization tests.
 * @returns {{ document: object, window: object }}
 */
function createMockDom() {
    /**
     * @param {string} tagName
     * @returns {any}
     */
    function createElement(tagName) {
        return {
            tagName: String(tagName).toLowerCase(),
            children: [],
            attributes: {},
            style: {},
            listeners: {},
            textContent: '',
            id: '',
            appendChild(child) {
                child.parentNode = this
                this.children.push(child)
                return child
            },
            setAttribute(name, value) {
                this.attributes[name] = String(value)
                if (name === 'id') this.id = String(value)
            },
            getAttribute(name) {
                return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
            },
            addEventListener(type, listener) {
                if (!this.listeners[type]) this.listeners[type] = []
                this.listeners[type].push(listener)
            },
            remove() {
                if (!this.parentNode) return
                const index = this.parentNode.children.indexOf(this)
                if (index >= 0) this.parentNode.children.splice(index, 1)
                this.parentNode = null
            }
        }
    }

    /**
     * @param {any} node
     * @param {string} id
     * @returns {any}
     */
    function findById(node, id) {
        if (node.id === id) return node
        for (const child of node.children || []) {
            const found = findById(child, id)
            if (found) return found
        }
        return null
    }

    const body = createElement('body')
    const document = {
        body,
        createElement,
        getElementById(id) {
            return findById(body, id)
        }
    }

    const listeners = {}
    const window = {
        addEventListener(type, listener) {
            if (!listeners[type]) listeners[type] = []
            listeners[type].push(listener)
        },
        removeEventListener(type, listener) {
            const list = listeners[type] || []
            const index = list.indexOf(listener)
            if (index >= 0) list.splice(index, 1)
        }
    }

    return { document, window }
}

/**
 * Creates a full controller stub required by both imperative and declarative registration.
 * @returns {object}
 */
function createControllerStub() {
    return {
        async connectCom() {
            return {}
        },
        async disconnectCom() {
            return {}
        },
        async startTest() {
            return {}
        },
        stopTest() {
            return {}
        },
        setDebounce() {
            return {}
        },
        setDtmfEnabled() {
            return {}
        },
        addIdealDiagrams() {
            return {}
        },
        clearDiagrams() {
            return {}
        },
        showAnalysis() {
            return {}
        },
        exportStrip() {
            return {}
        },
        downloadDiagram() {
            return {}
        },
        setLocale() {
            return {}
        },
        openHelp() {
            return {}
        },
        closeHelp() {
            return {}
        },
        getState() {
            return {}
        },
        getCycles() {
            return []
        },
        getAnalysisSnapshot() {
            return {}
        }
    }
}

/**
 * Verifies initWebMcp keeps the app functional when modelContext is unavailable.
 * @returns {void}
 */
test('initWebMcp returns disabled state without navigator.modelContext', () => {
    const originalNavigator = globalThis.navigator
    const warnings = []
    const logger = {
        info() {},
        warn(message) {
            warnings.push(String(message))
        },
        error() {}
    }

    globalThis.navigator = {}

    try {
        const result = initWebMcp({ controller: createControllerStub(), logger })
        assert.equal(result.enabled, false)
        assert.equal(result.imperativeNames.length, 0)
        assert.equal(result.declarativeNames.length, 0)
        assert.ok(warnings.some((message) => message.includes('navigator.modelContext unavailable')))
    } finally {
        globalThis.navigator = originalNavigator
    }
})

/**
 * Verifies initialization succeeds in a native-like environment.
 * @returns {void}
 */
test('initWebMcp registers tools with native-like modelContext', () => {
    const originalNavigator = globalThis.navigator
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const { document, window } = createMockDom()
    let providedTools = 0

    globalThis.document = document
    globalThis.window = window
    globalThis.navigator = {
        modelContext: {
            provideContext(context) {
                providedTools = context.tools.length
            }
        },
        modelContextTesting: {}
    }

    try {
        const result = initWebMcp({ controller: createControllerStub() })
        assert.equal(result.enabled, true)
        assert.equal(result.imperativeNames.length, 17)
        assert.equal(result.declarativeNames.length, 17)
        assert.equal(providedTools, 17)
        result.cleanup()
        assert.equal(document.getElementById('webmcpDeclarativeHost'), null)
    } finally {
        globalThis.navigator = originalNavigator
        globalThis.document = originalDocument
        globalThis.window = originalWindow
    }
})

/**
 * Verifies initialization succeeds in a fallback-like environment where only modelContext exists.
 * @returns {void}
 */
test('initWebMcp registers tools with fallback-like modelContext', () => {
    const originalNavigator = globalThis.navigator
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const { document, window } = createMockDom()

    globalThis.document = document
    globalThis.window = window
    globalThis.navigator = {
        modelContext: {
            provideContext() {}
        }
    }

    try {
        const result = initWebMcp({ controller: createControllerStub() })
        assert.equal(result.enabled, true)
        assert.equal(result.imperativeNames.length, 17)
        assert.equal(result.declarativeNames.length, 17)
    } finally {
        globalThis.navigator = originalNavigator
        globalThis.document = originalDocument
        globalThis.window = originalWindow
    }
})
