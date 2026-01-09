/**
 * Export/print diagrams: creates a long image (PNG/JPG) from all visible diagram canvases.
 * @param {Array<HTMLCanvasElement>} diagramCanvases
 * @param {object} [options]
 * @param {number} [options.margin=20]
 * @param {string} [options.bg="white"]
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
    for (const c of canvases) {
        ctx.drawImage(c, margin, y)
        y += h + margin
    }
    return out
}

/**
 * Triggers a download for the canvas content.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 * @param {string} [mime="image/png"]
 * @param {number} [quality=0.92]
 * @returns {void}
 */
export function downloadCanvas(canvas, filename, mime = 'image/png', quality = 0.92) {
    const url = canvas.toDataURL(mime, quality)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
}

/**
 * Opens a new window and prints the canvas content.
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
export function printCanvas(canvas) {
    const dataUrl = canvas.toDataURL('image/png')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>Print</title>
    <style>
      body{ margin:0; padding:20px; font-family:"Manrope", "Segoe UI", Tahoma, sans-serif; }
      img{ max-width:100%; }
      @media print{ body{ padding:0; } }
    </style>
  </head><body>
    <img src="${dataUrl}" alt="Test strip" />
    <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(), 200);};</script>
  </body></html>`)
    w.document.close()
}
