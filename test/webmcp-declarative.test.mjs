import assert from 'node:assert/strict'
import test from 'node:test'
import { registerDeclarativeTools } from '../src/js/webmcp/registerDeclarativeTools.mjs'

/**
 * Creates a tiny DOM mock that supports the declarative registration module.
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
            name: '',
            id: '',
            type: '',
            value: '',
            required: false,
            action: '',
            method: '',
            parentNode: null,
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

    const windowListeners = {}
    const window = {
        addEventListener(type, listener) {
            if (!windowListeners[type]) windowListeners[type] = []
            windowListeners[type].push(listener)
        },
        removeEventListener(type, listener) {
            const list = windowListeners[type] || []
            const index = list.indexOf(listener)
            if (index >= 0) list.splice(index, 1)
        }
    }

    return { document, window }
}

/**
 * A lightweight FormData shim for the mock elements used in this test file.
 */
class MockFormData {
    /**
     * @param {any} form
     */
    constructor(form) {
        this.values = new Map()
        const controls = collectControls(form)
        for (const control of controls) {
            if (!control.name) continue
            this.values.set(control.name, readControlValue(control))
        }
    }

    /**
     * @param {string} name
     * @returns {FormDataEntryValue|null}
     */
    get(name) {
        return this.values.has(name) ? this.values.get(name) : null
    }
}

/**
 * Collects input/select controls recursively.
 * @param {any} node
 * @returns {Array<any>}
 */
function collectControls(node) {
    const controls = []
    const tag = String(node.tagName || '')
    if (tag === 'input' || tag === 'select') {
        controls.push(node)
    }
    for (const child of node.children || []) {
        controls.push(...collectControls(child))
    }
    return controls
}

/**
 * Reads control values similarly to browser form submission behavior.
 * @param {any} control
 * @returns {string}
 */
function readControlValue(control) {
    if (String(control.tagName) !== 'select') {
        return String(control.value ?? '')
    }
    if (control.value) return String(control.value)
    const selectedOption = (control.children || []).find((option) => option.selected)
    if (selectedOption) return String(selectedOption.value ?? '')
    const firstOption = control.children?.[0]
    return String(firstOption?.value ?? '')
}

/**
 * Creates a controller stub and records calls.
 * @returns {{ controller: object, calls: Array<{ name: string, args: Array<unknown> }> }}
 */
function createControllerStub() {
    const calls = []
    const controller = {
        async connectCom(options) {
            calls.push({ name: 'connectCom', args: [options] })
            return { connected: true }
        },
        async disconnectCom() {
            calls.push({ name: 'disconnectCom', args: [] })
            return { connected: false }
        },
        async startTest() {
            calls.push({ name: 'startTest', args: [] })
            return { running: true }
        },
        stopTest() {
            calls.push({ name: 'stopTest', args: [] })
            return { running: false }
        },
        setDebounce(value) {
            calls.push({ name: 'setDebounce', args: [value] })
            return { debounceMs: value }
        },
        setDtmfEnabled(value) {
            calls.push({ name: 'setDtmfEnabled', args: [value] })
            return { dtmfEnabled: value }
        },
        addIdealDiagrams(value) {
            calls.push({ name: 'addIdealDiagrams', args: [value] })
            return { added: value }
        },
        clearDiagrams() {
            calls.push({ name: 'clearDiagrams', args: [] })
            return { diagramCount: 0 }
        },
        showAnalysis(mode) {
            calls.push({ name: 'showAnalysis', args: [mode] })
            return { mode }
        },
        async exportStrip(format) {
            calls.push({ name: 'exportStrip', args: [format] })
            return { format }
        },
        async downloadDiagram(index) {
            calls.push({ name: 'downloadDiagram', args: [index] })
            return { index }
        },
        setLocale(locale) {
            calls.push({ name: 'setLocale', args: [locale] })
            return { locale }
        },
        openHelp() {
            calls.push({ name: 'openHelp', args: [] })
            return { helpOpen: true }
        },
        closeHelp() {
            calls.push({ name: 'closeHelp', args: [] })
            return { helpOpen: false }
        },
        getState() {
            calls.push({ name: 'getState', args: [] })
            return { connected: true }
        },
        getCycles() {
            calls.push({ name: 'getCycles', args: [] })
            return [{ digit: 1 }]
        },
        getAnalysisSnapshot() {
            calls.push({ name: 'getAnalysisSnapshot', args: [] })
            return { ready: true }
        }
    }

    return { controller, calls }
}

/**
 * Finds a declarative form by toolname in the host container.
 * @param {any} host
 * @param {string} toolName
 * @returns {any}
 */
function findFormByToolName(host, toolName) {
    return (host.children || []).find((child) => child.getAttribute?.('toolname') === toolName)
}

/**
 * Ensures declarative registration creates all forms with required annotations.
 * @returns {void}
 */
test('registerDeclarativeTools creates annotated tool forms', () => {
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const originalFormData = globalThis.FormData
    const { document, window } = createMockDom()
    const { controller } = createControllerStub()

    globalThis.document = document
    globalThis.window = window
    globalThis.FormData = MockFormData

    try {
        const registration = registerDeclarativeTools(controller)
        assert.equal(registration.names.length, 17)
        assert.equal(registration.host.id, 'webmcpDeclarativeHost')

        const debounceForm = findFormByToolName(registration.host, 'rotary_form_set_debounce')
        assert.ok(debounceForm)
        assert.equal(debounceForm.getAttribute('toolautosubmit'), '')
        assert.equal(debounceForm.getAttribute('tooldescription'), 'Set debounce value in milliseconds.')

        const debounceInput = collectControls(debounceForm).find((control) => control.name === 'debounceMs')
        assert.equal(debounceInput.getAttribute('toolparamtitle'), 'Debounce ms')
        assert.match(debounceInput.getAttribute('toolparamdescription'), /0 to 10/)
    } finally {
        globalThis.document = originalDocument
        globalThis.window = originalWindow
        globalThis.FormData = originalFormData
    }
})

/**
 * Ensures submit handlers map form values to controller calls and use respondWith for agent invocations.
 * @returns {Promise<void>}
 */
test('declarative submit maps arguments and responds when agent-invoked', async () => {
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const originalFormData = globalThis.FormData
    const { document, window } = createMockDom()
    const { controller, calls } = createControllerStub()

    globalThis.document = document
    globalThis.window = window
    globalThis.FormData = MockFormData

    try {
        const registration = registerDeclarativeTools(controller)
        const debounceForm = findFormByToolName(registration.host, 'rotary_form_set_debounce')
        const debounceInput = collectControls(debounceForm).find((control) => control.name === 'debounceMs')
        debounceInput.value = '6'

        let responded = false
        let responsePromise = null
        const submitListener = debounceForm.listeners.submit[0]
        await submitListener({
            preventDefault() {},
            agentInvoked: true,
            respondWith(promise) {
                responded = true
                responsePromise = promise
            }
        })

        const response = await responsePromise
        assert.equal(responded, true)
        assert.equal(calls[0].name, 'setDebounce')
        assert.deepEqual(calls[0].args, [6])
        assert.equal(response.structuredContent.ok, true)
    } finally {
        globalThis.document = originalDocument
        globalThis.window = originalWindow
        globalThis.FormData = originalFormData
    }
})

/**
 * Ensures failed declarative actions propagate structured errors via respondWith.
 * @returns {Promise<void>}
 */
test('declarative submit returns structured errors', async () => {
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const originalFormData = globalThis.FormData
    const { document, window } = createMockDom()
    const { controller } = createControllerStub()
    controller.showAnalysis = () => {
        throw new Error('Analysis unavailable')
    }

    globalThis.document = document
    globalThis.window = window
    globalThis.FormData = MockFormData

    try {
        const registration = registerDeclarativeTools(controller)
        const analysisForm = findFormByToolName(registration.host, 'rotary_form_show_analysis')
        const modeSelect = collectControls(analysisForm).find((control) => control.name === 'mode')
        modeSelect.value = 'runtime'

        let responsePromise = null
        const submitListener = analysisForm.listeners.submit[0]
        await submitListener({
            preventDefault() {},
            agentInvoked: true,
            respondWith(promise) {
                responsePromise = promise
            }
        })

        const response = await responsePromise
        assert.equal(response.isError, true)
        assert.equal(response.structuredContent.ok, false)
        assert.equal(response.structuredContent.error.code, 'UNKNOWN_ERROR')
    } finally {
        globalThis.document = originalDocument
        globalThis.window = originalWindow
        globalThis.FormData = originalFormData
    }
})

/**
 * Ensures declarative argument validation returns INVALID_ARGUMENT and skips controller execution.
 * @returns {Promise<void>}
 */
test('declarative submit validates argument ranges', async () => {
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const originalFormData = globalThis.FormData
    const { document, window } = createMockDom()
    const { controller, calls } = createControllerStub()

    globalThis.document = document
    globalThis.window = window
    globalThis.FormData = MockFormData

    try {
        const registration = registerDeclarativeTools(controller)
        const debounceForm = findFormByToolName(registration.host, 'rotary_form_set_debounce')
        const debounceInput = collectControls(debounceForm).find((control) => control.name === 'debounceMs')
        debounceInput.value = '99'

        let responsePromise = null
        const submitListener = debounceForm.listeners.submit[0]
        await submitListener({
            preventDefault() {},
            agentInvoked: true,
            respondWith(promise) {
                responsePromise = promise
            }
        })

        const response = await responsePromise
        assert.equal(response.isError, true)
        assert.equal(response.structuredContent.error.code, 'INVALID_ARGUMENT')
        assert.equal(calls.length, 0)
    } finally {
        globalThis.document = originalDocument
        globalThis.window = originalWindow
        globalThis.FormData = originalFormData
    }
})
