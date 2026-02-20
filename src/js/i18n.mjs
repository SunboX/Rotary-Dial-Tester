const SUPPORTED_LOCALES = ['en', 'de']
const DEFAULT_LOCALE = 'en'

const translations = {
    en: {
        app: {
            title: 'Rotary Dial Tester',
            subtitle: 'Testing & adjusting mechanical rotary dials using Web Serial and an RS-232 interface'
        },
        header: {
            connect: 'Connect COM',
            disconnect: 'Disconnect',
            portInfoTitle: 'Port info',
            githubTitle: 'GitHub',
            githubAria: 'GitHub repository'
        },
        port: {
            notConnected: 'not connected',
            connected: 'connected'
        },
        status: {
            title: 'Status',
            digit: 'Digit',
            pulses: 'Pulses',
            diagram: 'Diagram'
        },
        gauge: {
            frequency: 'Pulse frequency',
            frequencyHint: 'Nominal 10 Hz (tolerance 9.1-11.1 Hz)',
            ratio: 'Pulse/pause ratio',
            ratioSuffix: 'nsi closed',
            ratioHint: 'Display equals (pause / (pulse+pause)) - warning outside 10-70%'
        },
        pulseStrip: {
            title: 'Pulses (1...10)',
            hint: 'Note: For frequency testing, choose digits 2-0 (1 is not a full period).',
            ariaLabel: 'Pulse display',
            dotTitle: {
                one: 'Pulse {count}',
                other: 'Pulse {count}'
            }
        },
        controls: {
            title: 'Controls',
            start: 'Start Test',
            stop: 'Stop Test',
            debounce: 'Debounce (EP)',
            dtmf: 'DTMF',
            ideal: 'Ideal rotary dial',
            clear: 'Clear diagrams',
            print: 'Print test strip',
            savePng: 'Save PNG',
            saveJpg: 'Save JPG',
            analysisRuntime: 'Analysis: runtime (10x)',
            analysisSpread: 'Analysis: pulse/pause (10x)',
            analysisNote:
                'Note: Unlocks after 10 diagrams with the same digit. Runtime shows timing spread across 10 cycles; pulse/pause lists min/max and delta per period.',
            help: 'Help'
        },
        diagrams: {
            title: 'Diagrams',
            empty: 'No diagrams yet.',
            ariaLabel: 'Measurement diagrams',
            downloadPng: 'Download PNG',
            pulsesMeta: {
                one: '{count} pulse',
                other: '{count} pulses'
            }
        },
        analysis: {
            title: 'Analysis',
            runtimeTitle: 'Analysis: runtime (10x)',
            spreadTitle: 'Analysis: pulse/pause (10x)',
            runtimeNoteNsa: '(measured from first nsi open to nsa open again)',
            runtimeNoteNsi: '(measured from first nsi open to last nsi closed)',
            runtimeSpread: 'timing spread of runs: {value}ms',
            runtimeRun: 'Run {count}',
            runtimeGrid: 'Grid = 10/100ms',
            spreadNotEnough: 'Not enough pulses for spread analysis.',
            spreadPeriod: 'Period',
            spreadOpenMin: 'nsi open (pulse) min',
            spreadOpenMax: 'nsi open max',
            spreadClosedMin: 'nsi closed (pause) min',
            spreadClosedMax: 'nsi closed max',
            spreadDelta: 'Delta',
            spreadNote: 'Note: matches the original logic (first pulse off phase is not used for period calculation).'
        },
        help: {
            title: 'Help - COM/Program',
            close: 'Close',
            browser:
                '<strong>Browser:</strong> WebSerial works in Chromium-based browsers (Chrome, Edge). The page must run over <code>https://</code> or <code>http://localhost</code>.',
            signalsTitle: '<strong>Signals (hardware mapping):</strong>',
            signalDcd: '<code>DCD</code> -> <strong>nsi</strong> (pulse contact)',
            signalDsr: '<code>DSR</code> -> <strong>nsr</strong> (optional, additional contact)',
            signalRi: '<code>RI</code> -> <strong>nsa</strong> (optional, off-normal)',
            signalRts: '<code>RTS</code> is set to <code>1</code> at start (as "H source" in the original).',
            usage:
                '<strong>Usage:</strong> 1) "Connect COM", 2) "Start Test", 3) dial digits 2-0. After each dial a diagram is created.',
            debounce:
                '<strong>Debounce (EP):</strong> Corresponds to the additional wait time between two signal reads for <code>DCD</code>. EP1 is the default. Higher values can compensate bounce but distort the overall measurement.',
            analysis: '<strong>Analysis:</strong> If 10 diagrams in a row with the same digit are captured, both analyses are enabled.',
            adjustmentTitle: '<strong>Rotary dial testing and adjustment:</strong>',
            adjustmentMisDial:
                'Mis-dials can happen when the dial runs too fast or too slow. The return speed is mainly controlled by the centrifugal governor and mechanical friction.',
            adjustmentPulseCount: 'Pulse count (IWF): digit 1..9 creates 1..9 pulses, digit 0 creates 10 pulses.',
            adjustmentTiming:
                'Nominal timing is 10 pulses per second (100 ms per pulse) with about 62 ms open and 38 ms closed (ratio ~1.6:1). Allowed tolerances are 90-110 ms per pulse (9.09-11.1 Hz) and a ratio of about 1.3:1 to 1.9:1. Some exchanges can be more strict.',
            adjustmentContacts:
                'Contacts: <strong>nsi</strong> is closed at rest and generates the pulse interruptions; <strong>nsa</strong> is open at rest and closes during dialing. With 3-wire dials, nsi and nsa are in series and can be identified with a continuity tester.',
            adjustmentNsr:
                'Optional <strong>nsr</strong> (often on 6-wire dials) suppresses two initial pulses to enforce a clear pause between digits.',
            adjustmentMaintenance:
                'Maintenance tips: slow dials are often caused by old grease. Clean with brake cleaner, then lubricate very sparingly with tiny drops of suitable oil. Avoid acetone/alcohol/harsh solvents on plastics and avoid silicone oil. If mis-dials persist, clean the contacts with a paper strip (optionally moistened with contact cleaner).'
        },
        imprint: {
            title: 'Imprint',
            responsible: 'Responsible for this website',
            contact: 'Contact'
        },
        social: {
            mastodonTitle: 'Mastodon',
            mastodonAria: 'Mastodon profile'
        },
        language: {
            label: 'Language',
            english: 'English',
            german: 'German'
        },
        diagram: {
            stateClosed: 'closed',
            stateOpen: 'open',
            axisMs: 'ms',
            noNsa: '- no extra nsa connected -',
            noNsr: '- no extra nsr connected -',
            idealNote: '- example of an ideal rotary dial only! -',
            debounceNote: 'modified debounce compensation!'
        },
        warnings: {
            nsiOpen: 'nsi is open (DCD=0). Waiting for the first closure.',
            dialSpeed: 'WARNING: Dial speed is outside the valid range (7-13 Hz).',
            pulsePauseRatio: 'WARNING: nsi pulse/pause ratio is outside the valid range (10-70%).'
        },
        errors: {
            webSerialMissing: 'WebSerial not available. Use Chrome/Edge and https:// or localhost.',
            webSerialMissingLink: 'https://caniuse.com/web-serial',
            webSerialUserActionRequired: 'User interaction required to open the serial chooser. Please connect manually once.',
            portNotOpen: 'Port not open.',
            portNotConnected: 'Port not connected.',
            noDiagramsToExport: 'No diagrams available for export.',
            diagramNotFound: 'The requested diagram is not available.'
        },
        print: {
            title: 'Print',
            alt: 'Test strip'
        }
    },
    de: {
        app: {
            title: 'Nummernschalter-Prüfer',
            subtitle: 'Testen und Justieren mechanischer Wählscheiben mit WebSerial und einer RS-232-Schnittstelle'
        },
        header: {
            connect: 'COM verbinden',
            disconnect: 'Trennen',
            portInfoTitle: 'Port-Info',
            githubTitle: 'GitHub',
            githubAria: 'GitHub-Repository'
        },
        port: {
            notConnected: 'nicht verbunden',
            connected: 'verbunden'
        },
        status: {
            title: 'Status',
            digit: 'Ziffer',
            pulses: 'Impulse',
            diagram: 'Diagramm'
        },
        gauge: {
            frequency: 'Impulsfrequenz',
            frequencyHint: 'Nennwert 10 Hz (Toleranz 9,1-11,1 Hz)',
            ratio: 'Impuls/Pausen-Verhältnis',
            ratioSuffix: 'nsi geschlossen',
            ratioHint: 'Anzeige entspricht (Pause / (Impuls+Pause)) – Warnung außerhalb 10-70%'
        },
        pulseStrip: {
            title: 'Impulse (1...10)',
            hint: 'Hinweis: Für die Frequenzprüfung Ziffern 2–0 wählen (1 ist keine volle Periode).',
            ariaLabel: 'Impulsanzeige',
            dotTitle: {
                one: 'Impuls {count}',
                other: 'Impuls {count}'
            }
        },
        controls: {
            title: 'Steuerung',
            start: 'Test starten',
            stop: 'Test stoppen',
            debounce: 'Entprellen (EP)',
            dtmf: 'DTMF',
            ideal: 'Ideale Wählscheibe',
            clear: 'Diagramme löschen',
            print: 'Teststreifen drucken',
            savePng: 'PNG speichern',
            saveJpg: 'JPG speichern',
            analysisRuntime: 'Analyse: Laufzeit (10x)',
            analysisSpread: 'Analyse: Impuls/Pause (10x)',
            analysisNote:
                'Hinweis: Wird nach 10 Diagrammen mit derselben Ziffer freigeschaltet. Laufzeit zeigt die Zeitstreuung über 10 Zyklen; Impuls/Pause listet Min/Max und Delta je Periode.',
            help: 'Hilfe'
        },
        diagrams: {
            title: 'Diagramme',
            empty: 'Noch keine Diagramme.',
            ariaLabel: 'Messdiagramme',
            downloadPng: 'PNG herunterladen',
            pulsesMeta: {
                one: '{count} Impuls',
                other: '{count} Impulse'
            }
        },
        analysis: {
            title: 'Analyse',
            runtimeTitle: 'Analyse: Laufzeit (10x)',
            spreadTitle: 'Analyse: Impuls/Pause (10x)',
            runtimeNoteNsa: '(gemessen von erstem nsi Öffnen bis nsa wieder öffnet)',
            runtimeNoteNsi: '(gemessen von erstem nsi Öffnen bis letztes nsi Schließen)',
            runtimeSpread: 'Zeitstreuung der Läufe: {value}ms',
            runtimeRun: 'Lauf {count}',
            runtimeGrid: 'Raster = 10/100 ms',
            spreadNotEnough: 'Nicht genügend Impulse für die Streuungsanalyse.',
            spreadPeriod: 'Periode',
            spreadOpenMin: 'nsi offen (Impuls) min',
            spreadOpenMax: 'nsi offen max',
            spreadClosedMin: 'nsi geschlossen (Pause) min',
            spreadClosedMax: 'nsi geschlossen max',
            spreadDelta: 'Delta',
            spreadNote: 'Hinweis: Entspricht der Originallogik (erste Impuls-Off-Phase wird nicht für die Periodenberechnung verwendet).'
        },
        help: {
            title: 'Hilfe – COM/Programm',
            close: 'Schließen',
            browser:
                '<strong>Browser:</strong> WebSerial funktioniert in Chromium-basierten Browsern (Chrome, Edge). Die Seite muss über <code>https://</code> oder <code>http://localhost</code> laufen.',
            signalsTitle: '<strong>Signale (Hardware-Zuordnung):</strong>',
            signalDcd: '<code>DCD</code> -> <strong>nsi</strong> (Impulskontakt)',
            signalDsr: '<code>DSR</code> -> <strong>nsr</strong> (optional, zusätzlicher Kontakt)',
            signalRi: '<code>RI</code> -> <strong>nsa</strong> (optional, Off-Normal)',
            signalRts: '<code>RTS</code> wird beim Start auf <code>1</code> gesetzt (als "H-Quelle" im Original).',
            usage:
                '<strong>Verwendung:</strong> 1) "COM verbinden", 2) "Test starten", 3) Ziffern 2–0 wählen. Nach jeder Wahl wird ein Diagramm erstellt.',
            debounce:
                '<strong>Entprellen (EP):</strong> Entspricht der zusätzlichen Wartezeit zwischen zwei Signalabfragen für <code>DCD</code>. EP1 ist der Standard. Höhere Werte können Prellen ausgleichen, verfälschen aber die Messung.',
            analysis: '<strong>Analyse:</strong> Wenn 10 Diagramme hintereinander mit derselben Ziffer erfasst werden, werden beide Analysen aktiviert.',
            adjustmentTitle: '<strong>Prüfen und Justieren von Wählscheiben:</strong>',
            adjustmentMisDial:
                'Fehlwahlen können auftreten, wenn die Scheibe zu schnell oder zu langsam läuft. Die Rücklaufgeschwindigkeit wird hauptsächlich durch Fliehkraftregler und mechanische Reibung bestimmt.',
            adjustmentPulseCount: 'Impulszahl (IWF): Ziffer 1..9 erzeugt 1..9 Impulse, Ziffer 0 erzeugt 10 Impulse.',
            adjustmentTiming:
                'Die Nennzeit beträgt 10 Impulse pro Sekunde (100 ms pro Impuls) mit etwa 62 ms offen und 38 ms geschlossen (Verhältnis ~1,6:1). Zulässige Toleranzen sind 90–110 ms pro Impuls (9,09–11,1 Hz) und ein Verhältnis von etwa 1,3:1 bis 1,9:1. Einige Vermittlungen können strenger sein.',
            adjustmentContacts:
                'Kontakte: <strong>nsi</strong> ist in Ruhe geschlossen und erzeugt die Impulsunterbrechungen; <strong>nsa</strong> ist in Ruhe offen und schließt während des Wählens. Bei 3-adrigen Wählscheiben liegen nsi und nsa in Serie und können mit einem Durchgangsprüfer identifiziert werden.',
            adjustmentNsr:
                'Optionales <strong>nsr</strong> (häufig bei 6-adrigen Wählscheiben) unterdrückt zwei Anfangsimpulse, um eine klare Pause zwischen den Ziffern zu erzwingen.',
            adjustmentMaintenance:
                'Wartungstipps: Langsame Wählscheiben werden oft durch altes Fett verursacht. Mit Bremsenreiniger säubern, dann sehr sparsam mit kleinen Tropfen geeignetem Öls schmieren. Aceton/Alkohol/aggressive Lösungsmittel bei Kunststoffen meiden und kein Silikonöl verwenden. Bei anhaltenden Fehlwahlen die Kontakte mit einem Papierstreifen reinigen (optional mit Kontaktreiniger angefeuchtet).'
        },
        imprint: {
            title: 'Impressum',
            responsible: 'Verantwortlich für diese Website',
            contact: 'Kontakt'
        },
        social: {
            mastodonTitle: 'Mastodon',
            mastodonAria: 'Mastodon-Profil'
        },
        language: {
            label: 'Sprache',
            english: 'Englisch',
            german: 'Deutsch'
        },
        diagram: {
            stateClosed: 'zu',
            stateOpen: 'auf',
            axisMs: 'ms',
            noNsa: '- kein zusätzliches nsa angeschlossen -',
            noNsr: '- kein zusätzliches nsr angeschlossen -',
            idealNote: '- Beispiel einer idealen Wählscheibe! -',
            debounceNote: 'modifizierte Entprellkompensation!'
        },
        warnings: {
            nsiOpen: 'nsi ist offen (DCD=0). Warte auf die erste Schließung.',
            dialSpeed: 'WARNUNG: Wählscheibengeschwindigkeit außerhalb des gültigen Bereichs (7–13 Hz).',
            pulsePauseRatio: 'WARNUNG: nsi Impuls/Pausen-Verhältnis außerhalb des gültigen Bereichs (10–70 %).'
        },
        errors: {
            webSerialMissing: 'WebSerial nicht verfügbar. Chrome/Edge und https:// oder localhost verwenden.',
            webSerialMissingLink: 'https://caniuse.com/web-serial',
            webSerialUserActionRequired: 'Benutzeraktion erforderlich, um den seriellen Auswahldialog zu öffnen. Bitte einmal manuell verbinden.',
            portNotOpen: 'Port ist nicht geöffnet.',
            portNotConnected: 'Port nicht verbunden.',
            noDiagramsToExport: 'Keine Diagramme für den Export verfügbar.',
            diagramNotFound: 'Das angeforderte Diagramm ist nicht verfügbar.'
        },
        print: {
            title: 'Drucken',
            alt: 'Teststreifen'
        }
    }
}

let currentLocale = DEFAULT_LOCALE

/**
 * Resolves a locale identifier to a supported short code.
 * @param {string} locale
 * @returns {string}
 */
function normalizeLocale(locale) {
    const normalized = String(locale || '').toLowerCase().split('-')[0]
    return SUPPORTED_LOCALES.includes(normalized) ? normalized : DEFAULT_LOCALE
}

/**
 * Returns a translation entry for the requested locale and key.
 * @param {string} locale
 * @param {string} key
 * @returns {string|object|undefined}
 */
function getTranslation(locale, key) {
    const parts = key.split('.')
    let node = translations[locale]
    for (const part of parts) {
        if (!node || typeof node !== 'object') return undefined
        node = node[part]
    }
    return node
}

/**
 * Formats a message template by replacing {tokens} with provided values.
 * @param {string} message
 * @param {Record<string, string|number>} values
 * @returns {string}
 */
function formatMessage(message, values) {
    // Replace {token} placeholders so localized strings can include dynamic data.
    return message.replace(/\{(\w+)\}/g, (_, token) => String(values[token] ?? `{${token}}`))
}

/**
 * Sets the active locale and updates the document language attribute when available.
 * @param {string} locale
 * @returns {string}
 */
export function setLocale(locale) {
    currentLocale = normalizeLocale(locale)
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('lang', currentLocale)
    }
    return currentLocale
}

/**
 * Returns the currently active locale.
 * @returns {string}
 */
export function getLocale() {
    return currentLocale
}

/**
 * Returns a translated message for the current locale.
 * @param {string} key
 * @param {Record<string, string|number>} [values]
 * @returns {string}
 */
export function t(key, values = {}) {
    const entry = getTranslation(currentLocale, key) ?? getTranslation(DEFAULT_LOCALE, key)
    if (!entry) return key
    if (typeof entry === 'string') return formatMessage(entry, values)
    if (typeof entry === 'object') {
        const count = Number(values.count)
        const form = count === 1 ? 'one' : 'other'
        const template = entry[form] || entry.other || ''
        return formatMessage(template, values)
    }
    return key
}

/**
 * Applies translations to elements with data-i18n hooks inside the given root.
 * @param {Document|HTMLElement} [root=document]
 * @returns {void}
 */
export function applyTranslations(root = document) {
    if (!root) return

    const htmlNodes = root.querySelectorAll('[data-i18n-html]')
    htmlNodes.forEach((node) => {
        const key = node.getAttribute('data-i18n-html')
        if (!key) return
        node.innerHTML = t(key)
    })

    const textNodes = root.querySelectorAll('[data-i18n]')
    textNodes.forEach((node) => {
        if (node.hasAttribute('data-i18n-html')) return
        const key = node.getAttribute('data-i18n')
        if (!key) return
        node.textContent = t(key)
    })

    const attrNodes = root.querySelectorAll('[data-i18n-attr]')
    attrNodes.forEach((node) => {
        const spec = node.getAttribute('data-i18n-attr')
        if (!spec) return
        spec.split(',').forEach((entry) => {
            const [attr, keyOverride] = entry.split(':').map((value) => value.trim())
            const key = keyOverride || node.getAttribute('data-i18n')
            if (!attr || !key) return
            node.setAttribute(attr, t(key))
        })
    })
}
