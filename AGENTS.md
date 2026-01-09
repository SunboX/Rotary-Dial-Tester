# Project Decisions

- UI language is English across the app and help text.
- WebSerial uses `baudRate` and signal keys `requestToSend`/`dataTerminalReady` to match the spec.
- The test run auto-starts after a device connects; if DCD is low, the tester starts and waits for the first closure (warning only).
- Diagrams are displayed in a vertical list and each diagram card has a per-diagram "Download PNG" action.
- Manrope is bundled locally at `src/assets/fonts/Manrope-Variable.woff2` and loaded via `@font-face` (no external font requests).
- ESM class modules use UpperCamelCase filenames: `SerialManager.mjs`, `RotaryTester.mjs`, `DtmfPlayer.mjs`.
- Unit tests live in `test/` and run with `node --test` via `npm test`.
- `package.json` metadata is updated for the rotary dial tester; `express` is a runtime dependency.
- Always add JSDoc comments to all methods, including private ones, and add inline comments that clearly explain functionality.
- Keep files below 1000 lines; split into reasonably named classes if they grow larger.
- Always follow `.prettierrc.json` formatting.
- Always write unit tests for bug fixes or new features, and add JSDoc to tests to explain what each test covers.
