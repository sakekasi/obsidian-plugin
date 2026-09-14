export interface PdfPageSize {
	/** Width in PDF points at scale 1, after rotation. */
	width: number
	/** Height in PDF points at scale 1, after rotation. */
	height: number
}

/**
 * The slice of a loaded PDF document that UI needs. In the plugin this wraps Obsidian's
 * bundled pdf.js; in the gallery it wraps `pdfjs-dist`.
 */
export interface PdfPageSource {
	readonly numPages: number
	getPageSize(page: number): Promise<PdfPageSize>
	/** Render `page` into `canvas`, resizing the canvas to fit the page at `scale`. */
	renderPage(page: number, canvas: HTMLCanvasElement, scale: number): Promise<void>
}
