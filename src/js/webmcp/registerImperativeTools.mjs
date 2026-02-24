import { createToolFailure, createToolSuccess } from './toolResponse.mjs'
import {
    assertAllowedKeys,
    readBooleanArg,
    readEnumArg,
    readNumberArg,
    readStringArg,
    requireToolInputObject
} from './toolArgs.mjs'

const ANALYSIS_MODES = ['runtime', 'spread']
const EXPORT_FORMATS = ['png', 'jpg', 'print']

/**
 * Registers imperative WebMCP tools through provideContext() or registerTool().
 * @param {import('../app/AppController.mjs').AppController} controller
 * @returns {{ names: string[], cleanup: () => void }}
 */
export function registerImperativeTools(controller) {
    if (!navigator?.modelContext) {
        return {
            names: [],
            cleanup() {}
        }
    }

    const modelContext = navigator.modelContext
    const tools = buildTools(controller)
    const toolNames = tools.map((tool) => tool.name)

    if (typeof modelContext.provideContext === 'function') {
        modelContext.provideContext({ tools })
        return {
            names: toolNames,
            cleanup() {
                if (typeof modelContext.clearContext === 'function') {
                    modelContext.clearContext()
                }
            }
        }
    }

    if (typeof modelContext.registerTool === 'function') {
        const unregisterCallbacks = []

        try {
            for (const tool of tools) {
                const registration = modelContext.registerTool(tool)
                if (registration && typeof registration.unregister === 'function') {
                    unregisterCallbacks.push(() => registration.unregister())
                    continue
                }

                if (typeof modelContext.unregisterTool === 'function') {
                    unregisterCallbacks.push(() => modelContext.unregisterTool(tool.name))
                }
            }
        } catch (error) {
            // Roll back earlier tool registrations to avoid partial tool state.
            for (let index = unregisterCallbacks.length - 1; index >= 0; index -= 1) {
                unregisterCallbacks[index]()
            }
            throw error
        }

        return {
            names: toolNames,
            cleanup() {
                // Unregister in reverse order so dependencies are removed last.
                for (let index = unregisterCallbacks.length - 1; index >= 0; index -= 1) {
                    unregisterCallbacks[index]()
                }
            }
        }
    }

    return {
        names: [],
        cleanup() {}
    }
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_connect', ['preferKnown'])
                    const preferKnown = readBooleanArg(args.preferKnown, {
                        name: 'preferKnown',
                        defaultValue: true
                    })
                    const state = await controller.connectCom({ preferKnown: !!preferKnown })
                    return createToolSuccess('Connected and started.', { state })
                })
        },
        {
            name: 'rotary_disconnect',
            description: 'Disconnect from the current serial device and stop testing.',
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_disconnect', [])
                    const state = await controller.disconnectCom()
                    return createToolSuccess('Disconnected.', { state })
                })
        },
        {
            name: 'rotary_start_test',
            description: 'Start rotary dial measurement on the connected device.',
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_start_test', [])
                    const state = await controller.startTest()
                    return createToolSuccess('Measurement started.', { state })
                })
        },
        {
            name: 'rotary_stop_test',
            description: 'Stop rotary dial measurement.',
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_stop_test', [])
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_set_debounce', ['debounceMs'])
                    const debounceMs = readNumberArg(args.debounceMs, {
                        name: 'debounceMs',
                        required: true,
                        min: 0,
                        max: 10,
                        integer: true
                    })
                    const state = controller.setDebounce(debounceMs)
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_set_dtmf', ['enabled'])
                    const enabled = readBooleanArg(args.enabled, {
                        name: 'enabled',
                        required: true
                    })
                    const state = controller.setDtmfEnabled(enabled)
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_add_ideal_diagrams', ['count'])
                    const count = readNumberArg(args.count, {
                        name: 'count',
                        defaultValue: 10,
                        min: 1,
                        max: 10,
                        integer: true
                    })
                    const state = controller.addIdealDiagrams(count)
                    return createToolSuccess('Ideal diagrams added.', { state })
                })
        },
        {
            name: 'rotary_clear_diagrams',
            description: 'Clear all diagrams and reset displayed measurements.',
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_clear_diagrams', [])
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_show_analysis', ['mode'])
                    const mode = readEnumArg(args.mode, {
                        name: 'mode',
                        values: ANALYSIS_MODES,
                        required: true
                    })
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_export_strip', ['format'])
                    const format = readEnumArg(args.format, {
                        name: 'format',
                        values: EXPORT_FORMATS,
                        required: true
                    })
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_download_diagram', ['index'])
                    const index = readNumberArg(args.index, {
                        name: 'index',
                        required: true,
                        min: 0,
                        integer: true
                    })
                    const result = await controller.downloadDiagram(index)
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
            execute: async (input = {}) =>
                await executeTool(async () => {
                    const args = parseToolArgs(input, 'rotary_set_locale', ['locale'])
                    const locale = readStringArg(args.locale, {
                        name: 'locale',
                        required: true
                    })
                    const state = controller.setLocale(locale)
                    return createToolSuccess('Locale updated.', { state })
                })
        },
        {
            name: 'rotary_open_help',
            description: 'Open the help dialog.',
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_open_help', [])
                    const state = controller.openHelp()
                    return createToolSuccess('Help opened.', { state })
                })
        },
        {
            name: 'rotary_close_help',
            description: 'Close the help dialog.',
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_close_help', [])
                    const state = controller.closeHelp()
                    return createToolSuccess('Help closed.', { state })
                })
        },
        {
            name: 'rotary_get_state',
            description: 'Get current runtime/UI state.',
            annotations: {
                readOnlyHint: true
            },
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_get_state', [])
                    const state = controller.getState()
                    return createToolSuccess('State snapshot returned.', { state })
                })
        },
        {
            name: 'rotary_get_cycles',
            description: 'Get captured measurement cycles.',
            annotations: {
                readOnlyHint: true
            },
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_get_cycles', [])
                    const cycles = controller.getCycles()
                    return createToolSuccess('Cycles returned.', { cycles })
                })
        },
        {
            name: 'rotary_get_analysis',
            description: 'Get analysis readiness and summary data.',
            annotations: {
                readOnlyHint: true
            },
            inputSchema: emptyObjectSchema(),
            execute: async (input = {}) =>
                await executeTool(async () => {
                    parseToolArgs(input, 'rotary_get_analysis', [])
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
 * Normalizes and validates generic tool argument objects.
 * @param {unknown} input
 * @param {string} toolName
 * @param {Array<string>} allowedKeys
 * @returns {Record<string, unknown>}
 */
function parseToolArgs(input, toolName, allowedKeys) {
    const args = requireToolInputObject(input, toolName)
    assertAllowedKeys(args, toolName, allowedKeys)
    return args
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
