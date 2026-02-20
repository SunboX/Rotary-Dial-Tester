import { t } from './i18n.mjs'

/**
 * Export/print diagrams: creates a long image (PNG/JPG) from all visible diagram canvases.
 * @param {Array<HTMLCanvasElement>} diagramCanvases
 * @param {object} [options]
 * @param {number} [options.margin=20]
 * @param {string} [options.bg='white']
 * @returns {HTMLCanvasElement|null}
 */
export function composeStripImage(diagramCanvases, { margin = 20, bg = 'white' } = {}) {
    const canvases = diagramCanvases.filter(Boolean)
    if (!canvases.length) return null

    const w = canvases[0].width
    const h = canvases[0].height
    const out = document.createElement('canvas')
    out.width = w + margin * 2
    out.height = canvases.length * (h + margin) + margin

    const ctx = out.getContext('2d')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, out.width, out.height)

    let y = margin
    for (const canvas of canvases) {
        ctx.drawImage(canvas, margin, y)
        y += h + margin
    }
    return out
}

/**
 * Triggers a download for the canvas content.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 * @param {string} [mime='image/png']
 * @param {number} [quality=0.92]
 * @returns {void}
 */
export function downloadCanvas(canvas, filename, mime = 'image/png', quality = 0.92) {
    const url = canvas.toDataURL(mime, quality)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
}

/**
 * Triggers a download for a Blob payload.
 * @param {Blob} blob
 * @param {string} filename
 * @returns {void}
 */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
}

/**
 * Opens a new window and prints the canvas content.
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
export function printCanvas(canvas) {
    const dataUrl = canvas.toDataURL('image/png')
    printImageSource(dataUrl)
}

/**
 * Opens a new window and prints a Blob image.
 * @param {Blob} blob
 * @returns {void}
 */
export function printBlob(blob) {
    const url = URL.createObjectURL(blob)
    printImageSource(url, () => {
        URL.revokeObjectURL(url)
    })
}

/**
 * Writes a temporary print document using the provided image URL.
 * @param {string} src
 * @param {() => void} [onDone]
 * @returns {void}
 */
function printImageSource(src, onDone) {
    const win = window.open('', '_blank')
    if (!win) {
        onDone?.()
        return
    }

    win.document.write(`<!doctype html><html><head><title>${t('print.title')}</title>
    <style>
      body{ margin:0; padding:20px; font-family:"Manrope", "Segoe UI", Tahoma, sans-serif; }
      img{ max-width:100%; }
      @media print{ body{ padding:0; } }
    </style>
  </head><body>
    <img src="${src}" alt="${t('print.alt')}" />
    <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(), 200);};</script>
  </body></html>`)
    win.document.close()
    onDone?.()
}
