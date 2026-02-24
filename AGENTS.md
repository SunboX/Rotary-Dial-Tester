# AGENTS.md

## Project Overview
- This repository contains the Rotary Dial Tester web app with WebSerial and WebMCP support.
- Browser app assets and modules live in `src/`.
- Test files live in `test/` and run with Node's built-in test runner.
- Local server entry is `server.mjs`.
- Main browser entry is `src/main.mjs` and `src/index.html`.

## Key Files
- `server.mjs`
- `src/main.mjs`
- `src/index.html`
- `src/style.css`
- `src/js/app/AppController.mjs`
- `src/js/measurement/RotaryTester.mjs`
- `src/js/serial/SerialManager.mjs`
- `src/js/audio/DtmfPlayer.mjs`
- `src/js/webmcp/registerImperativeTools.mjs`
- `src/js/webmcp/registerDeclarativeTools.mjs`

## Build, Run, Test
- Install dependencies: `npm install`
- Start local server: `npm start`
- Open app: `http://localhost:8080/`
- Run tests: `npm test`

## Deployment
- GitHub Actions FTP deployment workflow: `.github/workflows/deploy-ftp.yml`
- Workflow deploys `src/` to FTP root and deploys `node_modules/` when dependency files change.

## Project Decisions
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

## Coding and Test Guidelines
- Keep modules focused; split large files into clearly named classes/modules before they exceed 1000 lines.
- Use class/module naming consistently with existing `UpperCamelCase` file naming for class-oriented `.mjs` modules.
- Add or update unit tests for every bug fix and new behavior.
- Keep tests in `test/` and cover observable behavior, not implementation details.

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file.

### Available skills
- `find-skills`: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill. (file: `/Users/afiedler/.agents/skills/find-skills/SKILL.md`)
- `systematic-debugging`: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes (file: `/Users/afiedler/.agents/skills/systematic-debugging/SKILL.md`)
- `skill-creator`: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: `/Users/afiedler/.codex/skills/.system/skill-creator/SKILL.md`)
- `skill-installer`: Install Codex skills into `$CODEX_HOME/skills` from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: `/Users/afiedler/.codex/skills/.system/skill-installer/SKILL.md`)

### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1. After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2. When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3. If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4. If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5. If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
