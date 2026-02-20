import { createToolFailure, createToolSuccess } from './toolResponse.mjs'

/**
 * Registers imperative WebMCP tools through navigator.modelContext.provideContext().
 * @param {import('../app/AppController.mjs').AppController} controller
 * @returns {{ names: string[] }}
 */
export function registerImperativeTools(controller) {
    if (!navigator?.modelContext?.provideContext) {
        return { names: [] }
    }

    const tools = buildTools(controller)
    navigator.modelContext.provideContext({ tools })
    return { names: tools.map((tool) => tool.name) }
}

/**
 * Creates all imperative tool descriptors with JSON schemas.
 * @param {import('../app/AppController.mjs').AppController} controller
 * @returns {Array<object>}
 */
function buildTools(controller) {
    return [
        {
            name: 'rotary_connect',
            description: 'Connect to a rotary dial tester serial device and auto-start the test loop.',
            inputSchema: {
                type: 'object',
                properties: {
                    preferKnown: {
                        type: 'boolean',
                        description: 'Try already-granted serial ports first before opening the chooser.'
                    }
                },
                additionalProperties: false
            },
            execute: async ({ preferKnown = true } = {}) =>
                await executeTool(async () => {
                    const state = await controller.connectCom({ preferKnown: !!preferKnown })
                    return createToolSuccess('Connected and started.', { state })
                })
        },
        {
            name: 'rotary_disconnect',
            description: 'Disconnect from the current serial device and stop testing.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const state = await controller.disconnectCom()
                    return createToolSuccess('Disconnected.', { state })
                })
        },
        {
            name: 'rotary_start_test',
            description: 'Start rotary dial measurement on the connected device.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const state = await controller.startTest()
                    return createToolSuccess('Measurement started.', { state })
                })
        },
        {
            name: 'rotary_stop_test',
            description: 'Stop rotary dial measurement.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const state = controller.stopTest()
                    return createToolSuccess('Measurement stopped.', { state })
                })
        },
        {
            name: 'rotary_set_debounce',
            description: 'Set debounce EP value in milliseconds (0-10).',
            inputSchema: {
                type: 'object',
                properties: {
                    debounceMs: {
                        type: 'number',
                        minimum: 0,
                        maximum: 10,
                        description: 'Debounce delay in milliseconds.'
                    }
                },
                required: ['debounceMs'],
                additionalProperties: false
            },
            execute: async ({ debounceMs } = {}) =>
                await executeTool(async () => {
                    const state = controller.setDebounce(Number(debounceMs))
                    return createToolSuccess('Debounce updated.', { state })
                })
        },
        {
            name: 'rotary_set_dtmf',
            description: 'Enable or disable DTMF tone feedback.',
            inputSchema: {
                type: 'object',
                properties: {
                    enabled: {
                        type: 'boolean',
                        description: 'Whether DTMF tones should be played after measured digits.'
                    }
                },
                required: ['enabled'],
                additionalProperties: false
            },
            execute: async ({ enabled } = {}) =>
                await executeTool(async () => {
                    const state = controller.setDtmfEnabled(!!enabled)
                    return createToolSuccess('DTMF setting updated.', { state })
                })
        },
        {
            name: 'rotary_add_ideal_diagrams',
            description: 'Insert ideal reference diagrams.',
            inputSchema: {
                type: 'object',
                properties: {
                    count: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 10,
                        description: 'How many ideal diagrams to add.'
                    }
                },
                additionalProperties: false
            },
            execute: async ({ count = 10 } = {}) =>
                await executeTool(async () => {
                    const state = controller.addIdealDiagrams(Number(count))
                    return createToolSuccess('Ideal diagrams added.', { state })
                })
        },
        {
            name: 'rotary_clear_diagrams',
            description: 'Clear all diagrams and reset displayed measurements.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const state = controller.clearDiagrams()
                    return createToolSuccess('Diagrams cleared.', { state })
                })
        },
        {
            name: 'rotary_show_analysis',
            description: 'Show either runtime or pulse/pause spread analysis.',
            inputSchema: {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        enum: ['runtime', 'spread'],
                        description: 'Analysis view mode.'
                    }
                },
                required: ['mode'],
                additionalProperties: false
            },
            execute: async ({ mode } = {}) =>
                await executeTool(async () => {
                    const state = controller.showAnalysis(mode)
                    return createToolSuccess('Analysis view updated.', { state })
                })
        },
        {
            name: 'rotary_export_strip',
            description: 'Export all diagrams as one strip (PNG, JPG, or print view).',
            inputSchema: {
                type: 'object',
                properties: {
                    format: {
                        type: 'string',
                        enum: ['png', 'jpg', 'print'],
                        description: 'Export output format.'
                    }
                },
                required: ['format'],
                additionalProperties: false
            },
            execute: async ({ format } = {}) =>
                await executeTool(async () => {
                    const exportResult = await controller.exportStrip(format)
                    return createToolSuccess('Strip export completed.', { export: exportResult })
                })
        },
        {
            name: 'rotary_download_diagram',
            description: 'Download one diagram card as PNG.',
            inputSchema: {
                type: 'object',
                properties: {
                    index: {
                        type: 'integer',
                        minimum: 0,
                        description: 'Zero-based diagram index in the current list.'
                    }
                },
                required: ['index'],
                additionalProperties: false
            },
            execute: async ({ index } = {}) =>
                await executeTool(async () => {
                    const result = await controller.downloadDiagram(Number(index))
                    return createToolSuccess('Diagram downloaded.', { download: result })
                })
        },
        {
            name: 'rotary_set_locale',
            description: 'Set the UI language locale.',
            inputSchema: {
                type: 'object',
                properties: {
                    locale: {
                        type: 'string',
                        description: 'Locale code like "en" or "de".'
                    }
                },
                required: ['locale'],
                additionalProperties: false
            },
            execute: async ({ locale } = {}) =>
                await executeTool(async () => {
                    const state = controller.setLocale(String(locale || 'en'))
                    return createToolSuccess('Locale updated.', { state })
                })
        },
        {
            name: 'rotary_open_help',
            description: 'Open the help dialog.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const state = controller.openHelp()
                    return createToolSuccess('Help opened.', { state })
                })
        },
        {
            name: 'rotary_close_help',
            description: 'Close the help dialog.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const state = controller.closeHelp()
                    return createToolSuccess('Help closed.', { state })
                })
        },
        {
            name: 'rotary_get_state',
            description: 'Get current runtime/UI state.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const state = controller.getState()
                    return createToolSuccess('State snapshot returned.', { state })
                })
        },
        {
            name: 'rotary_get_cycles',
            description: 'Get captured measurement cycles.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const cycles = controller.getCycles()
                    return createToolSuccess('Cycles returned.', { cycles })
                })
        },
        {
            name: 'rotary_get_analysis',
            description: 'Get analysis readiness and summary data.',
            inputSchema: emptyObjectSchema(),
            execute: async () =>
                await executeTool(async () => {
                    const analysis = controller.getAnalysisSnapshot()
                    return createToolSuccess('Analysis snapshot returned.', { analysis })
                })
        }
    ]
}

/**
 * Runs a tool function with standard failure handling.
 * @param {() => Promise<import('./types.mjs').ToolResponseLike>} run
 * @returns {Promise<import('./types.mjs').ToolResponseLike>}
 */
async function executeTool(run) {
    try {
        return await run()
    } catch (err) {
        return createToolFailure(err)
    }
}

/**
 * Returns a strict empty-object schema used by tools without parameters.
 * @returns {object}
 */
function emptyObjectSchema() {
    return {
        type: 'object',
        properties: {},
        additionalProperties: false
    }
}
