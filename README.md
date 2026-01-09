# Rotary Dial Tester (WebSerial)

This app implements a rotary dial tester as a web app using **navigator.serial** (Web Serial API)
and modern **ESM (*.mjs)** modules.

## Requirements

- Chromium browser (Chrome / Edge) with WebSerial
- The page must be served over `https://` or `http://localhost`
- A serial adapter that exposes modem status lines (DCD/DSR/RI) and is wired correctly

## Run locally

From the project folder:

### Node.js / npm

```bash
npm install
npm start
```

Then open: http://localhost:8080/

### Python (static server)

```bash
python3 -m http.server 8000
```

Then open: http://localhost:8000/

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
