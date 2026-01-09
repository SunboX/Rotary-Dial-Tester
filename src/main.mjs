/*
 * @license
 * Getting Started with Web Serial Codelab (https://todo)
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */
let port
let reader
let inputDone
let outputDone
let inputStream
let outputStream

const log = document.getElementById('log')
const ledCBs = document.querySelectorAll('input.led')
const divLeftBut = document.getElementById('leftBut')
const divRightBut = document.getElementById('rightBut')
const butConnect = document.getElementById('butConnect')

const GRID_HAPPY = [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0]
const GRID_SAD = [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1]
const GRID_OFF = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const GRID_HEART = [0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0]

document.addEventListener('DOMContentLoaded', () => {
    // Wire UI events once the document is ready.
    butConnect.addEventListener('click', clickConnect)

    // Toggle the support banner based on Web Serial availability.
    const notSupported = document.getElementById('notSupported')
    notSupported.classList.toggle('hidden', 'serial' in navigator)
})

/**
 * Opens a Web Serial connection and starts reading data.
 * @returns {Promise<void>}
 */
async function connect() {
    // Request a port from the user.
    port = await navigator.serial.requestPort()

    if (port === null) {
        // User canceled the picker dialog.
        return
    }

    // Open the port with the expected baud rate.
    await port.open({ baudRate: 9600 })

    if (port.readable === null) {
        // Bail out if the stream is not available.
        throw new Error('Port missing readable!')
    }

    // Read the incoming stream continuously.
    const reader = port.readable.getReader()
    while (true) {
        const { value, done } = await reader.read()
        if (done) {
            // The stream has been closed.
            break
        }
        if (value !== undefined) {
            // Replace with UI updates as needed.
            console.log(value)
        }
    }

    // CODELAB: Add code setup the output stream here.
    // CODELAB: Send CTRL-C and turn off echo on REPL
    // CODELAB: Add code to read the stream here.
}

/**
 * Closes the Web Serial connection and resets the UI.
 * @returns {Promise<void>}
 */
async function disconnect() {
    // Clear the UI grid before closing the port.
    drawGrid(GRID_OFF)
    sendGrid()

    // CODELAB: Close the input stream (reader).

    // CODELAB: Close the output stream.

    // CODELAB: Close the port.
}

/**
 * Click handler for the connect/disconnect button.
 * @returns {Promise<void>}
 */
async function clickConnect() {
    // Establish the serial connection.
    await connect()

    // CODELAB: Reset the grid on connect here.

    // CODELAB: Initialize micro:bit buttons.

    // Update button and checkbox state.
    toggleUIConnected(true)
}

/**
 * Reads data from the input stream and displays it on screen.
 * @returns {Promise<void>}
 */
async function readLoop() {
    // Continuously read and render incoming serial data.
    // CODELAB: Add read loop here.
}

/**
 * Iterates over the checkboxes and generates the command to set the LEDs.
 * @returns {void}
 */
function sendGrid() {
    // Build and send the LED grid payload based on checkbox state.
    // CODELAB: Generate the grid
}

/**
 * Gets a writer from the output stream and sends lines to the micro:bit.
 * @param  {...string} lines lines to send to the micro:bit
 * @returns {void}
 */
function writeToStream(...lines) {
    // Serialize outgoing lines and write them to the output stream.
    // CODELAB: Write to output stream
}

/**
 * Tells the micro:bit to print a string on the console on button press.
 * @param {string} btnId Button ID (either BTN1 or BTN2)
 * @returns {void}
 */
function watchButton(btnId) {
    // Register device-side handlers for button presses.
    // CODELAB: Hook up the micro:bit buttons to print a string.
}

/**
 * TransformStream to parse the stream into lines.
 */
class LineBreakTransformer {
    /**
     * Creates a new transformer with a buffer for incomplete lines.
     */
    constructor() {
        // A container for holding stream data until a new line.
        this.container = ''
    }

    /**
     * Splits incoming chunks into lines and enqueues them.
     * @param {string} chunk
     * @param {TransformStreamDefaultController} controller
     * @returns {void}
     */
    transform(chunk, controller) {
        // Split incoming data and enqueue complete lines.
        // CODELAB: Handle incoming chunk
    }

    /**
     * Flushes any remaining buffered text.
     * @param {TransformStreamDefaultController} controller
     * @returns {void}
     */
    flush(controller) {
        // Emit any buffered text as a final line.
        // CODELAB: Flush the stream.
    }
}

/**
 * TransformStream to parse the stream into a JSON object.
 */
class JSONTransformer {
    /**
     * Parses JSON chunks and enqueues objects if valid.
     * @param {string} chunk
     * @param {TransformStreamDefaultController} controller
     * @returns {void}
     */
    transform(chunk, controller) {
        // Attempt to parse each chunk into JSON and forward valid objects.
        // CODELAB: Attempt to parse JSON content
    }
}

/**
 * Event handler called when one of the micro:bit buttons is pushed.
 * @param {object} butEvt
 * @returns {void}
 */
function buttonPushed(butEvt) {
    // React to button events from the device.
    // CODELAB: micro:bit button press handler
}

/**
 * The code below is mostly UI code and is provided to simplify the codelab.
 */

/**
 * Attaches change handlers for all LED checkboxes.
 * @returns {void}
 */
function initCheckboxes() {
    ledCBs.forEach((cb) => {
        cb.addEventListener('change', () => {
            // Push the new LED grid state to the device.
            sendGrid()
        })
    })
}

/**
 * Updates the UI LEDs to match the provided grid.
 * @param {number[]} grid
 * @returns {void}
 */
function drawGrid(grid) {
    if (grid) {
        grid.forEach((v, i) => {
            // Convert numeric values to checked states.
            ledCBs[i].checked = !!v
        })
    }
}

/**
 * Toggles the UI to connected/disconnected state.
 * @param {boolean} connected
 * @returns {void}
 */
function toggleUIConnected(connected) {
    let lbl = 'Connect'
    if (connected) {
        lbl = 'Disconnect'
    }
    // Update the button label based on connection state.
    butConnect.textContent = lbl
    ledCBs.forEach((cb) => {
        if (connected) {
            // Enable LED inputs when connected.
            cb.removeAttribute('disabled')
            return
        }
        // Disable LED inputs when disconnected.
        cb.setAttribute('disabled', true)
    })
}
