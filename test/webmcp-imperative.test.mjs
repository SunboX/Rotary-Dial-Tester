import assert from 'node:assert/strict'
import test from 'node:test'
import { registerImperativeTools } from '../src/js/webmcp/registerImperativeTools.mjs'

/**
 * Creates a controller stub and records invoked methods.
 * @param {Record<string, Function>} [overrides]
 * @returns {{ controller: object, calls: Array<{ name: string, args: Array<unknown> }> }}
 */
function createControllerStub(overrides = {}) {
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
        addIdealDiagrams(count) {
            calls.push({ name: 'addIdealDiagrams', args: [count] })
            return { diagramCount: count }
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
            return { format, diagramCount: 10 }
        },
        async downloadDiagram(index) {
            calls.push({ name: 'downloadDiagram', args: [index] })
            return { index, filename: `diagram-${index}.png` }
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
            return [{ digit: 3 }]
        },
        getAnalysisSnapshot() {
            calls.push({ name: 'getAnalysisSnapshot', args: [] })
            return { ready: true }
        },
        ...overrides
    }

    return { controller, calls }
}

/**
 * Registers imperative tools and verifies all planned names and schemas are present.
 * @returns {void}
 */
test('registerImperativeTools publishes the full tool inventory', () => {
    const originalNavigator = globalThis.navigator
    /** @type {Array<object>} */
    const contexts = []
    globalThis.navigator = {
        modelContext: {
            provideContext(context) {
                contexts.push(context)
            }
        }
    }

    try {
        const { controller } = createControllerStub()
        const result = registerImperativeTools(controller)
        assert.equal(contexts.length, 1)
        assert.ok(Array.isArray(contexts[0].tools))
        assert.equal(result.names.length, 17)

        const names = contexts[0].tools.map((tool) => tool.name)
        assert.ok(names.includes('rotary_connect'))
        assert.ok(names.includes('rotary_set_debounce'))
        assert.ok(names.includes('rotary_download_diagram'))
        assert.ok(names.includes('rotary_get_analysis'))

        const debounceTool = contexts[0].tools.find((tool) => tool.name === 'rotary_set_debounce')
        assert.deepEqual(debounceTool.inputSchema.required, ['debounceMs'])
        assert.equal(debounceTool.inputSchema.properties.debounceMs.minimum, 0)
        assert.equal(debounceTool.inputSchema.properties.debounceMs.maximum, 10)
    } finally {
        globalThis.navigator = originalNavigator
    }
})

/**
 * Ensures tool execution delegates to controller commands and returns structured success.
 * @returns {Promise<void>}
 */
test('imperative tool execute delegates to controller', async () => {
    const originalNavigator = globalThis.navigator
    /** @type {Array<object>} */
    const contexts = []
    globalThis.navigator = {
        modelContext: {
            provideContext(context) {
                contexts.push(context)
            }
        }
    }

    try {
        const { controller, calls } = createControllerStub()
        registerImperativeTools(controller)
        const tool = contexts[0].tools.find((candidate) => candidate.name === 'rotary_set_debounce')
        const response = await tool.execute({ debounceMs: 4 })

        assert.equal(calls[0].name, 'setDebounce')
        assert.deepEqual(calls[0].args, [4])
        assert.equal(response.structuredContent.ok, true)
        assert.equal(response.structuredContent.state.debounceMs, 4)
    } finally {
        globalThis.navigator = originalNavigator
    }
})

/**
 * Ensures failed tool commands return standardized error responses.
 * @returns {Promise<void>}
 */
test('imperative tool execute returns structured errors', async () => {
    const originalNavigator = globalThis.navigator
    /** @type {Array<object>} */
    const contexts = []
    globalThis.navigator = {
        modelContext: {
            provideContext(context) {
                contexts.push(context)
            }
        }
    }

    try {
        const { controller } = createControllerStub({
            async exportStrip() {
                throw new Error('Export failed')
            }
        })
        registerImperativeTools(controller)
        const tool = contexts[0].tools.find((candidate) => candidate.name === 'rotary_export_strip')
        const response = await tool.execute({ format: 'png' })

        assert.equal(response.isError, true)
        assert.equal(response.structuredContent.ok, false)
        assert.equal(response.structuredContent.error.code, 'UNKNOWN_ERROR')
        assert.match(response.structuredContent.error.message, /Export failed/)
    } finally {
        globalThis.navigator = originalNavigator
    }
})
