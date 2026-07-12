function collectDocumentCss(): string {
  const chunks: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        chunks.push(rule.cssText)
      }
    } catch {
      if (sheet.href) {
        chunks.push(`@import url(${JSON.stringify(sheet.href)});`)
      }
    }
  }
  return chunks.join('\n')
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'financial-statement'
}

function preparePrintClone(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.fs-no-print').forEach((element) => element.remove())
  return clone
}

function buildPrintDocumentHtml(root: HTMLElement, title: string): string {
  const clone = preparePrintClone(root)
  const css = collectDocumentCss()

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
${css}
      body {
        margin: 0;
        padding: 0;
        background: #fff;
      }
    </style>
  </head>
  <body>
    ${clone.outerHTML}
  </body>
</html>`
}

function downloadHtmlFile(html: string, filenameBase: string) {
  const filename = `${sanitizeFilename(filenameBase)}.html`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadPrintDocument(root: HTMLElement, filenameBase: string, documentTitle: string) {
  const html = buildPrintDocumentHtml(root, documentTitle)
  downloadHtmlFile(html, filenameBase)
}

export function triggerPrintWithDownload(_root: HTMLElement | null, _filenameBase: string, _documentTitle: string) {
  window.print()
}
