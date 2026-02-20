# Rotary Dial Tester (WebSerial)

This app implements a rotary dial tester as a web app using **navigator.serial** (Web Serial API)
and modern **ESM (*.mjs)** modules.

Live version: https://rotary-dial-tester.com/  
The hosted build mirrors this repository and is the quickest way to try the tester without local setup. WebSerial requires a Chromium-based browser and will only allow connections on secure origins or `http://localhost`.

Inspiration: This project is inspired by the "NummernschalterPrüfer" app by Klaus Pfeiffer. The goal is to bring a similar rotary dial testing workflow to a modern, browser-based interface.

## Requirements

- Chromium browser (Chrome / Edge) with WebSerial
- The page must be served over `https://` or `http://localhost`
- A serial adapter that exposes modem status lines (DCD/DSR/RI) and is wired correctly

## WebMCP support

This app exposes its functionality through **WebMCP** (`navigator.modelContext`) in two ways:

- Imperative tools via JavaScript registration
- Declarative tools via hidden annotated forms

The app prefers the native Chrome implementation and also ships a local fallback polyfill at:

- `src/vendor/webmcp-global.iife.js`

### Native early-preview setup (Chrome)

- Chrome version `146.0.7672.0` or newer
- Enable: `chrome://flags/#enable-webmcp-testing`
- Relaunch Chrome

If native WebMCP is unavailable, the fallback script initializes `navigator.modelContext` automatically.

### Tool inventory

Imperative tool names:

- `rotary_connect`
- `rotary_disconnect`
- `rotary_start_test`
- `rotary_stop_test`
- `rotary_set_debounce`
- `rotary_set_dtmf`
- `rotary_add_ideal_diagrams`
- `rotary_clear_diagrams`
- `rotary_show_analysis`
- `rotary_export_strip`
- `rotary_download_diagram`
- `rotary_set_locale`
- `rotary_open_help`
- `rotary_close_help`
- `rotary_get_state`
- `rotary_get_cycles`
- `rotary_get_analysis`

Declarative equivalents use the `rotary_form_*` prefix.

### Serial permission caveat

`rotary_connect` first tries previously granted ports (`navigator.serial.getPorts()`), then falls back to the browser chooser.
On first-time permission flows, the browser may still require one manual user interaction before agent calls can open the chooser.

## Hardware setup

![Hardware setup](./pictures/hardware_setup.jpg)

For W48/W49 dials, use the dedicated adapter: https://github.com/SunboX/Rotary-Dial-Tester-Adapter
It provides the correct wiring and connector mapping for these phones and matches the signal lines
expected by the tester.

## Run locally

From the project folder:

### Node.js / npm

```bash
npm install
npm start
```

Then open: http://localhost:8080/


## Signal mapping

- nsi = DCD (dataCarrierDetect)
- nsr = DSR (dataSetReady)
- nsa = RI (ringIndicator)
- RTS is set to 1 on connect

## Usage

- Connect COM
- Start Test
- Dial digits 2-0 (1 is not a full period for frequency measurement)
- Diagrams appear on the right (max. 10, rolling)

## Debounce (EP)

EP adds an extra wait time between two DCD reads.
EP1 is the default. Higher values can compensate bounce but distort the measurement.

## Analysis

When 10 measurements in a row with the same digit are captured, two analyses are enabled:

- Runtime (10x): spread of runs (points/min/max)
- Pulse/Pause (10x): table with min/max/delta per period (without the first pulse off phase)

Note: The WebSerial API does not allow automatic COM port detection, so the port must be
selected in the browser dialog.
