// Reads PDFs in the browser with pdf.js, loaded only when a PDF is chosen.

import { itemsToLines, fromPdfItem } from "./pdf-lines.js"

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/"

// Returns the positioned text items of every page.
export async function fileToPages(file) {
  const pdfjs = await import(`${PDFJS}pdf.min.mjs`)
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(content.items.map(fromPdfItem))
  }
  return pages
}

// Returns plain text with table rows kept on one line.
export async function fileToText(file) {
  if (!file || !file.size) return ""
  if (/\.(txt|csv|md)$/i.test(file.name)) return file.text()
  const pages = await fileToPages(file)
  return pages.map((items) => itemsToLines(items).join("\n")).join("\n")
}
