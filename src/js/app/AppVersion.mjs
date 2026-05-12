// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const DEFAULT_PACKAGE_URL = './package.json'

/**
 * Returns the fetch URL for package metadata.
 * @param {HTMLElement|object} versionElement
 * @param {string|undefined} packageUrl
 * @returns {string}
 */
function resolvePackageUrl(versionElement, packageUrl) {
    if (packageUrl) return packageUrl

    const datasetUrl = versionElement?.dataset?.versionSource
    if (typeof datasetUrl === 'string' && datasetUrl.trim()) {
        return datasetUrl
    }

    return DEFAULT_PACKAGE_URL
}

/**
 * Reads a valid semantic version string from package metadata.
 * @param {unknown} packageMetadata
 * @returns {string|null}
 */
function readPackageVersion(packageMetadata) {
    if (!packageMetadata || typeof packageMetadata !== 'object') return null

    const version = packageMetadata.version
    if (typeof version !== 'string') return null

    const normalizedVersion = version.trim()
    return normalizedVersion ? normalizedVersion : null
}

/**
 * Fetches package metadata and writes the app version into the footer.
 * @param {object} [options]
 * @param {Document|object} [options.documentRef]
 * @param {Function} [options.fetchImpl]
 * @param {string} [options.packageUrl]
 * @returns {Promise<string|null>}
 */
export async function loadAppVersion({ documentRef = globalThis.document, fetchImpl = globalThis.fetch, packageUrl } = {}) {
    const versionElement = documentRef?.getElementById?.('appVersion')
    if (!versionElement || typeof fetchImpl !== 'function') return null

    const resolvedPackageUrl = resolvePackageUrl(versionElement, packageUrl)

    try {
        // Bypass browser HTTP caches so the footer follows the deployed package metadata.
        const response = await fetchImpl(resolvedPackageUrl, { cache: 'no-store' })
        if (!response?.ok) return null

        const version = readPackageVersion(await response.json())
        if (!version) return null

        versionElement.textContent = version
        return version
    } catch {
        return null
    }
}
