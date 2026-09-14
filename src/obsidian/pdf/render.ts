import { App, loadPdfJs, TFile } from 'obsidian'
import { PdfPageSource } from './page-source'

// Minimal typings for the pdf.js build Obsidian bundles (exposed as `window.pdfjsLib`).
export interface PdfJsViewport {
	width: number
	height: number
	convertToPdfPoint(x: number, y: number): [number, number]
	convertToViewportPoint(x: number, y: number): [number, number]
}

export interface PdfJsPage {
	getViewport(options: { scale: number }): PdfJsViewport
	render(options: {
		canvasContext: CanvasRenderingContext2D
		viewport: PdfJsViewport
		background?: string
	}): { promise: Promise<void> }
}

export interface PdfJsDocument {
	numPages: number
	getPage(page: number): Promise<PdfJsPage>
	destroy(): Promise<void>
}

interface PdfJsLib {
	getDocument(options: Record<string, unknown>): { promise: Promise<PdfJsDocument> }
}

let pdfjsLoading: Promise<unknown> | undefined

async function getPdfJs(): Promise<PdfJsLib> {
	const win = window as unknown as { pdfjsLib?: PdfJsLib }
	if (win.pdfjsLib) return win.pdfjsLib
	pdfjsLoading ??= loadPdfJs()
	await pdfjsLoading
	if (!win.pdfjsLib) throw new Error('pdf.js is unavailable')
	return win.pdfjsLib
}

interface OpenDocument {
	mtime: number
	document: Promise<PdfJsDocument>
}

/**
 * Keeps a few PDF documents open so rendering several pages of the same file doesn't
 * re-parse it. Documents are reopened when the file changes on disk.
 */
export class PdfDocuments {
	private readonly open = new Map<string, OpenDocument>()

	constructor(
		private readonly app: App,
		private readonly maxOpen = 4
	) {}

	async get(file: TFile): Promise<PdfJsDocument> {
		const existing = this.open.get(file.path)
		if (existing && existing.mtime === file.stat.mtime) {
			// Re-insert to mark as most recently used.
			this.open.delete(file.path)
			this.open.set(file.path, existing)
			return existing.document
		}
		if (existing) this.close(file.path)

		const pdfjs = await getPdfJs()
		const document = pdfjs.getDocument({
			url: this.app.vault.getResourcePath(file),
			// Assets bundled with Obsidian's pdf.js, as used by the Excalidraw plugin.
			cMapUrl: '/lib/pdfjs/cmaps/',
			cMapPacked: true,
			standardFontDataUrl: '/lib/pdfjs/standard_fonts/',
		}).promise
		this.open.set(file.path, { mtime: file.stat.mtime, document })

		// Evict the least recently used documents.
		;[...this.open.keys()].slice(0, Math.max(0, this.open.size - this.maxOpen)).forEach((path) => this.close(path))

		return document
	}

	private close(path: string) {
		const entry = this.open.get(path)
		if (!entry) return
		this.open.delete(path)
		void entry.document.then((doc) => doc.destroy()).catch(() => {})
	}

	dispose() {
		;[...this.open.keys()].forEach((path) => this.close(path))
	}
}

export interface RenderedPdfPage {
	blob: Blob
	/** Rendered size in pixels. */
	width: number
	height: number
	/** Page size in PDF points at scale 1, after the page's own rotation. */
	pageWidth: number
	pageHeight: number
}

export async function renderPdfPage(
	document: PdfJsDocument,
	pageNumber: number,
	scale: number
): Promise<RenderedPdfPage> {
	const page = await document.getPage(pageNumber)
	const viewport = page.getViewport({ scale })
	const base = page.getViewport({ scale: 1 })

	const canvas = window.document.createElement('canvas')
	canvas.width = Math.round(viewport.width)
	canvas.height = Math.round(viewport.height)
	const context = canvas.getContext('2d')
	if (!context) throw new Error('Unable to create a canvas context')

	await page.render({ canvasContext: context, viewport, background: 'rgba(0,0,0,0)' }).promise

	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Unable to encode page'))), 'image/png')
	)
	canvas.width = 0
	canvas.height = 0

	return {
		blob,
		width: Math.round(viewport.width),
		height: Math.round(viewport.height),
		pageWidth: base.width,
		pageHeight: base.height,
	}
}

/** Adapts an open document to the interface the import modal renders thumbnails from. */
export function toPdfPageSource(document: PdfJsDocument): PdfPageSource {
	return {
		numPages: document.numPages,
		async getPageSize(page) {
			const viewport = (await document.getPage(page)).getViewport({ scale: 1 })
			return { width: viewport.width, height: viewport.height }
		},
		async renderPage(page, canvas, scale) {
			const pdfPage = await document.getPage(page)
			const viewport = pdfPage.getViewport({ scale })
			canvas.width = Math.floor(viewport.width)
			canvas.height = Math.floor(viewport.height)
			const context = canvas.getContext('2d')
			if (!context) return
			await pdfPage.render({ canvasContext: context, viewport }).promise
		},
	}
}
