import { App, TFile } from 'obsidian'
import { CachedPdfPage, PdfPageCache } from './cache'
import { PdfDocuments, PdfJsViewport, RenderedPdfPage, renderPdfPage } from './render'

/** Pixels per PDF point when rendering pages for the canvas (Excalidraw's default is also 4). */
export const PDF_RENDER_SCALE = 4

let services: { documents: PdfDocuments; cache: PdfPageCache } | undefined

function getServices(app: App) {
	services ??= { documents: new PdfDocuments(app), cache: new PdfPageCache() }
	return services
}

export function disposePdfServices() {
	services?.documents.dispose()
	services?.cache.dispose()
	services = undefined
}

export function openPdfDocument(app: App, file: TFile) {
	return getServices(app).documents.get(file)
}

/** A rendered page, from the IndexedDB cache when possible. */
export async function getRenderedPdfPage(
	app: App,
	file: TFile,
	page: number,
	scale = PDF_RENDER_SCALE
): Promise<CachedPdfPage | RenderedPdfPage> {
	const { documents, cache } = getServices(app)
	const key = { path: file.path, mtime: file.stat.mtime, page, scale }

	const cached = await cache.get(key)
	if (cached) return cached

	const rendered = await renderPdfPage(await documents.get(file), page, scale)
	void cache.put(key, rendered)
	return rendered
}

/** The page's viewport at scale 1, used for page sizes and crop/rect conversion. */
export async function getPdfPageViewport(app: App, file: TFile, page: number): Promise<PdfJsViewport> {
	const document = await getServices(app).documents.get(file)
	return (await document.getPage(page)).getViewport({ scale: 1 })
}

/** Page number from a subpath like `#page=3&rect=…`, defaulting to 1. */
export function pageFromSubpath(subpath: string) {
	const page = Number(new URLSearchParams(subpath.replace(/^#/, '')).get('page'))
	return Number.isInteger(page) && page > 0 ? page : 1
}
