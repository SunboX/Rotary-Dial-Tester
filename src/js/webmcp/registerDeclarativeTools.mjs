import { createToolFailure, createToolSuccess } from './toolResponse.mjs'

const DECLARATIVE_HOST_ID = 'webmcpDeclarativeHost'

/**
 * Registers declarative WebMCP tools by creating hidden annotated forms.
 * @param {import('../app/AppController.mjs').AppController} controller
 * @returns {{ names: string[], host: HTMLDivElement|null, cleanup: () => void }}
 */
export function registerDeclarativeTools(controller) {
    if (typeof document === 'undefined') {
        return {
            names: [],
            host: null,
            cleanup() {}
        }
    }

    // Replace previous host to avoid duplicate form registrations on re-init.
    document.getElementById(DECLARATIVE_HOST_ID)?.remove()

    const host = document.createElement('div')
    host.id = DECLARATIVE_HOST_ID
    host.setAttribute('aria-hidden', 'true')
    applyHiddenHostStyle(host)

    const definitions = buildDeclarativeDefinitions(controller)
    const toolNames = []

    for (const definition of definitions) {
        const form = createAnnotatedForm(definition)
        toolNames.push(definition.name)
        host.appendChild(form)
    }

    document.body.appendChild(host)

    const onToolActivated = (event) => {
        console.info('[WebMCP] declarative tool activated', event?.toolName || '')
    }
    const onToolCancel = (event) => {
        console.info('[WebMCP] declarative tool canceled', event?.toolName || '')
    }

    window.addEventListener('toolactivated', onToolActivated)
    window.addEventListener('toolcancel', onToolCancel)

    return {
        names: toolNames,
        host,
        cleanup() {
            window.removeEventListener('toolactivated', onToolActivated)
            window.removeEventListener('toolcancel', onToolCancel)
            host.remove()
        }
    }
}

/**
 * Applies off-screen layout styles for hidden declarative tool forms.
 * @param {HTMLDivElement} host
 * @returns {void}
 */
function applyHiddenHostStyle(host) {
    host.style.position = 'absolute'
    host.style.left = '-10000px'
    host.style.top = '0'
    host.style.width = '1px'
    host.style.height = '1px'
    host.style.overflow = 'hidden'
    host.style.opacity = '0'
    host.style.pointerEvents = 'none'
}

/**
 * Creates all declarative tool descriptors mapped to controller methods.
 * @param {import('../app/AppController.mjs').AppController} controller
 * @returns {Array<object>}
 */
function buildDeclarativeDefinitions(controller) {
    return [
        {
            name: 'rotary_form_connect',
            description: 'Connect to a serial port and start measurement.',
            fields: [
                {
                    name: 'preferKnown',
                    title: 'Prefer known ports',
                    description: 'Use already granted ports before opening the chooser.',
                    kind: 'select',
                    options: [
                        { value: 'true', label: 'true' },
                        { value: 'false', label: 'false' }
                    ],
                    required: true,
                    defaultValue: 'true'
                }
            ],
            run: async (args) => {
                const state = await controller.connectCom({ preferKnown: args.preferKnown === true })
                return createToolSuccess('Connected and started.', { state })
            }
        },
        {
            name: 'rotary_form_disconnect',
            description: 'Disconnect from serial and stop measurement.',
            fields: [],
            run: async () => createToolSuccess('Disconnected.', { state: await controller.disconnectCom() })
        },
        {
            name: 'rotary_form_start_test',
            description: 'Start measurement loop.',
            fields: [],
            run: async () => createToolSuccess('Measurement started.', { state: await controller.startTest() })
        },
        {
            name: 'rotary_form_stop_test',
            description: 'Stop measurement loop.',
            fields: [],
            run: async () => createToolSuccess('Measurement stopped.', { state: controller.stopTest() })
        },
        {
            name: 'rotary_form_set_debounce',
            description: 'Set debounce value in milliseconds.',
            fields: [
                {
                    name: 'debounceMs',
                    title: 'Debounce ms',
                    description: 'Debounce delay in milliseconds from 0 to 10.',
                    kind: 'number',
                    required: true,
                    defaultValue: '0',
                    min: 0,
                    max: 10
                }
            ],
            run: async (args) => createToolSuccess('Debounce updated.', { state: controller.setDebounce(args.debounceMs) })
        },
        {
            name: 'rotary_form_set_dtmf',
            description: 'Enable or disable DTMF playback.',
            fields: [
                {
                    name: 'enabled',
                    title: 'DTMF enabled',
                    description: 'Whether to play DTMF tones after each dialed digit.',
                    kind: 'select',
                    options: [
                        { value: 'true', label: 'true' },
                        { value: 'false', label: 'false' }
                    ],
                    required: true,
                    defaultValue: 'true'
                }
            ],
            run: async (args) => createToolSuccess('DTMF updated.', { state: controller.setDtmfEnabled(args.enabled === true) })
        },
        {
            name: 'rotary_form_add_ideal_diagrams',
            description: 'Add ideal reference diagrams.',
            fields: [
                {
                    name: 'count',
                    title: 'Diagram count',
                    description: 'Number of ideal diagrams to insert.',
                    kind: 'number',
                    required: true,
                    defaultValue: '10',
                    min: 1,
                    max: 10
                }
            ],
            run: async (args) => createToolSuccess('Ideal diagrams added.', { state: controller.addIdealDiagrams(args.count) })
        },
        {
            name: 'rotary_form_clear_diagrams',
            description: 'Clear all captured diagrams.',
            fields: [],
            run: async () => createToolSuccess('Diagrams cleared.', { state: controller.clearDiagrams() })
        },
        {
            name: 'rotary_form_show_analysis',
            description: 'Show runtime or spread analysis view.',
            fields: [
                {
                    name: 'mode',
                    title: 'Analysis mode',
                    description: 'Analysis mode to display.',
                    kind: 'select',
                    options: [
                        { value: 'runtime', label: 'runtime' },
                        { value: 'spread', label: 'spread' }
                    ],
                    required: true,
                    defaultValue: 'runtime'
                }
            ],
            run: async (args) => createToolSuccess('Analysis view updated.', { state: controller.showAnalysis(args.mode) })
        },
        {
            name: 'rotary_form_export_strip',
            description: 'Export the full diagram strip.',
            fields: [
                {
                    name: 'format',
                    title: 'Export format',
                    description: 'Export format: png, jpg, or print.',
                    kind: 'select',
                    options: [
                        { value: 'png', label: 'png' },
                        { value: 'jpg', label: 'jpg' },
                        { value: 'print', label: 'print' }
                    ],
                    required: true,
                    defaultValue: 'png'
                }
            ],
            run: async (args) => createToolSuccess('Strip exported.', { export: await controller.exportStrip(args.format) })
        },
        {
            name: 'rotary_form_download_diagram',
            description: 'Download one diagram by index.',
            fields: [
                {
                    name: 'index',
                    title: 'Diagram index',
                    description: 'Zero-based index of the diagram card.',
                    kind: 'number',
                    required: true,
                    defaultValue: '0',
                    min: 0
                }
            ],
            run: async (args) =>
                createToolSuccess('Diagram downloaded.', { download: await controller.downloadDiagram(args.index) })
        },
        {
            name: 'rotary_form_set_locale',
            description: 'Set interface locale.',
            fields: [
                {
                    name: 'locale',
                    title: 'Locale',
                    description: 'Locale code such as en or de.',
                    kind: 'text',
                    required: true,
                    defaultValue: 'en'
                }
            ],
            run: async (args) => createToolSuccess('Locale updated.', { state: controller.setLocale(args.locale) })
        },
        {
            name: 'rotary_form_open_help',
            description: 'Open the help dialog.',
            fields: [],
            run: async () => createToolSuccess('Help opened.', { state: controller.openHelp() })
        },
        {
            name: 'rotary_form_close_help',
            description: 'Close the help dialog.',
            fields: [],
            run: async () => createToolSuccess('Help closed.', { state: controller.closeHelp() })
        },
        {
            name: 'rotary_form_get_state',
            description: 'Get current app state.',
            fields: [],
            run: async () => createToolSuccess('State returned.', { state: controller.getState() })
        },
        {
            name: 'rotary_form_get_cycles',
            description: 'Get captured cycles.',
            fields: [],
            run: async () => createToolSuccess('Cycles returned.', { cycles: controller.getCycles() })
        },
        {
            name: 'rotary_form_get_analysis',
            description: 'Get analysis summary.',
            fields: [],
            run: async () => createToolSuccess('Analysis returned.', { analysis: controller.getAnalysisSnapshot() })
        }
    ]
}

/**
 * Creates a hidden annotated form and binds submit handling for one declarative tool.
 * @param {object} definition
 * @returns {HTMLFormElement}
 */
function createAnnotatedForm(definition) {
    const form = document.createElement('form')
    form.setAttribute('toolname', definition.name)
    form.setAttribute('tooldescription', definition.description)
    form.setAttribute('toolautosubmit', '')
    form.action = '#'
    form.method = 'post'

    for (const field of definition.fields) {
        const label = document.createElement('label')
        label.textContent = field.title
        label.htmlFor = `${definition.name}-${field.name}`

        const control =
            field.kind === 'select'
                ? createSelectControl(definition.name, field)
                : createInputControl(definition.name, field)

        form.appendChild(label)
        form.appendChild(control)
    }

    // Submit button keeps form behavior standards-compliant.
    const submitButton = document.createElement('button')
    submitButton.type = 'submit'
    submitButton.textContent = 'Submit'
    form.appendChild(submitButton)

    form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const response = await handleDeclarativeSubmit(form, definition)
        respondToAgentIfNeeded(event, response)
    })

    return form
}

/**
 * Creates a select field for declarative schema generation.
 * @param {string} toolName
 * @param {object} field
 * @returns {HTMLSelectElement}
 */
function createSelectControl(toolName, field) {
    const select = document.createElement('select')
    select.name = field.name
    select.id = `${toolName}-${field.name}`
    if (field.required) select.required = true
    select.setAttribute('toolparamtitle', field.title)
    select.setAttribute('toolparamdescription', field.description)

    for (const option of field.options || []) {
        const optionElement = document.createElement('option')
        optionElement.value = option.value
        optionElement.textContent = option.label
        if (option.value === field.defaultValue) optionElement.selected = true
        select.appendChild(optionElement)
    }

    return select
}

/**
 * Creates an input field for declarative schema generation.
 * @param {string} toolName
 * @param {object} field
 * @returns {HTMLInputElement}
 */
function createInputControl(toolName, field) {
    const input = document.createElement('input')
    input.name = field.name
    input.id = `${toolName}-${field.name}`
    input.type = field.kind === 'number' ? 'number' : 'text'
    input.setAttribute('toolparamtitle', field.title)
    input.setAttribute('toolparamdescription', field.description)
    if (field.required) input.required = true
    if (field.defaultValue !== undefined) input.value = String(field.defaultValue)
    if (typeof field.min === 'number') input.min = String(field.min)
    if (typeof field.max === 'number') input.max = String(field.max)
    return input
}

/**
 * Executes a declarative action and returns a standardized tool response.
 * @param {HTMLFormElement} form
 * @param {object} definition
 * @returns {Promise<import('./types.mjs').ToolResponseLike>}
 */
async function handleDeclarativeSubmit(form, definition) {
    try {
        const args = extractDeclarativeArgs(form, definition.fields)
        return await definition.run(args)
    } catch (err) {
        return createToolFailure(err)
    }
}

/**
 * Reads and normalizes form values based on definition field types.
 * @param {HTMLFormElement} form
 * @param {Array<object>} fields
 * @returns {Record<string, unknown>}
 */
function extractDeclarativeArgs(form, fields) {
    const formData = new FormData(form)
    const args = {}

    for (const field of fields) {
        const rawValue = formData.get(field.name)
        if (rawValue === null) continue
        if (field.kind === 'number') {
            args[field.name] = Number(rawValue)
            continue
        }
        if (field.kind === 'select') {
            if (rawValue === 'true') {
                args[field.name] = true
                continue
            }
            if (rawValue === 'false') {
                args[field.name] = false
                continue
            }
        }
        args[field.name] = String(rawValue)
    }

    return args
}

/**
 * Responds to agent-triggered submit events when the browser exposes respondWith.
 * @param {SubmitEvent} event
 * @param {import('./types.mjs').ToolResponseLike} response
 * @returns {void}
 */
function respondToAgentIfNeeded(event, response) {
    if (!event?.agentInvoked) return
    if (typeof event.respondWith !== 'function') return
    event.respondWith(Promise.resolve(response))
}
