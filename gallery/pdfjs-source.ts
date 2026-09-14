/// <reference types="vite/client" />
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PdfPageSource } from 'src/obsidian/pdf/page-source'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type DisposablePdfPageSource = PdfPageSource & { destroy(): void }

/** Gallery-only PdfPageSource backed by pdfjs-dist (the plugin uses Obsidian's bundled pdf.js). */
export async function loadPdfSource(data: Uint8Array): Promise<DisposablePdfPageSource> {
	// pdf.js transfers the buffer to its worker, so hand it a copy.
	const loadingTask = pdfjs.getDocument({ data: data.slice() })
	const doc = await loadingTask.promise

	return {
		numPages: doc.numPages,
		async getPageSize(page) {
			const viewport = (await doc.getPage(page)).getViewport({ scale: 1 })
			return { width: viewport.width, height: viewport.height }
		},
		async renderPage(page, canvas, scale) {
			const pdfPage = await doc.getPage(page)
			const viewport = pdfPage.getViewport({ scale })
			canvas.width = Math.floor(viewport.width)
			canvas.height = Math.floor(viewport.height)
			await pdfPage.render({ canvas, viewport }).promise
		},
		destroy() {
			void loadingTask.destroy()
		},
	}
}
