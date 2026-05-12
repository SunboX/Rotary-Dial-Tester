// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'deploy-ftp.yml')

/**
 * Reads the FTP deployment workflow from disk.
 * @returns {string} Workflow source text.
 */
function readWorkflow() {
    return fs.readFileSync(workflowPath, 'utf8')
}

/**
 * Extracts a named workflow step block for focused assertions.
 * @param {string} workflow Workflow source text.
 * @param {string} name Step name to locate.
 * @returns {string} Matching step block.
 */
function getStepBlock(workflow, name) {
    const stepStart = workflow.indexOf(`- name: ${name}`)
    assert.notEqual(stepStart, -1, `Missing workflow step "${name}".`)

    const nextStepStart = workflow.indexOf('\n            - ', stepStart + 1)
    return workflow.slice(stepStart, nextStepStart === -1 ? workflow.length : nextStepStart)
}

/**
 * Ensures every FTP action is skipped when repository FTP secrets are absent.
 * @returns {void}
 */
test('FTP deploy steps require configured FTP credentials', () => {
    const workflow = readWorkflow()
    const credentialGuards = ["env.FTP_SERVER != ''", "env.FTP_USERNAME != ''", "env.FTP_PASSWORD != ''"]

    for (const secretName of ['FTP_SERVER', 'FTP_USERNAME', 'FTP_PASSWORD']) {
        assert.ok(workflow.includes(`${secretName}: \${{ secrets.${secretName} }}`))
    }

    for (const stepName of ['Deploy src to /', 'Deploy api to /api/', 'Deploy docs to /docs/', 'Deploy node_modules']) {
        const stepBlock = getStepBlock(workflow, stepName)

        for (const guard of credentialGuards) {
            assert.ok(stepBlock.includes(guard), `${stepName} must check ${guard}.`)
        }
    }
})

/**
 * Ensures missing FTP credentials produce a clear non-fatal workflow warning.
 * @returns {void}
 */
test('FTP deploy workflow reports skipped deployment when credentials are missing', () => {
    const workflow = readWorkflow()
    const stepBlock = getStepBlock(workflow, 'Report skipped FTP deployment')

    assert.ok(stepBlock.includes('::warning::FTP deployment skipped'))
    assert.ok(stepBlock.includes("env.FTP_SERVER == ''"))
    assert.ok(stepBlock.includes("env.FTP_USERNAME == ''"))
    assert.ok(stepBlock.includes("env.FTP_PASSWORD == ''"))
})

/**
 * Ensures production dependency deployment avoids dev-only Husky prepare hooks.
 * @returns {void}
 */
test('FTP deploy workflow installs production dependencies without lifecycle scripts', () => {
    const workflow = readWorkflow()
    const stepBlock = getStepBlock(workflow, 'Install production dependencies')

    assert.ok(stepBlock.includes('npm ci --omit=dev --ignore-scripts'))
})

/**
 * Ensures package metadata is published so the browser can read the app version.
 * @returns {void}
 */
test('FTP deploy workflow publishes package metadata for runtime version display', () => {
    const workflow = readWorkflow()
    const prepareStepBlock = getStepBlock(workflow, 'Prepare package metadata for deployment')
    const deployStepBlock = getStepBlock(workflow, 'Deploy package metadata')

    assert.ok(prepareStepBlock.includes('cp package.json .deploy-metadata/package.json'))
    assert.ok(deployStepBlock.includes('local-dir: ./.deploy-metadata/'))
    assert.ok(deployStepBlock.includes('server-dir: /'))
})

/**
 * Ensures the optional FTP port secret is forwarded to every FTP action.
 * @returns {void}
 */
test('FTP deploy workflow passes the configured FTP port to deploy actions', () => {
    const workflow = readWorkflow()
    const deploySteps = ['Deploy src to /', 'Deploy package metadata', 'Deploy api to /api/', 'Deploy docs to /docs/', 'Deploy node_modules']

    assert.ok(workflow.includes('FTP_PORT: ${{ secrets.FTP_PORT }}'))

    for (const stepName of deploySteps) {
        const stepBlock = getStepBlock(workflow, stepName)
        assert.ok(stepBlock.includes('port: ${{ env.FTP_PORT }}'), `${stepName} must pass FTP_PORT.`)
    }
})
