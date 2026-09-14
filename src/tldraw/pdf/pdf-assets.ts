import { App, TFile } from 'obsidian'
import { formatPdfSubpath } from 'src/obsidian/links/link-ref'
import { getPdfPageViewport, getRenderedPdfPage, pageFromSubpath } from 'src/obsidian/pdf/pdf-services'
import {
	BlockRefAssetId,
	ObsidianMarkdownFileTLAssetStoreProxy,
	ObsidianTLAssetStore,
} from 'src/tldraw/asset-store'
import { createImageAsset } from 'src/tldraw/helpers/create-asset'
import { Editor, TLImageAsset, TLImageShape } from 'tldraw'

export interface PdfPageAssetMeta {
	page: number
}

/**
 * Create an image asset that renders one PDF page. The asset's src is a block ref to a
 * `[[file.pdf#page=N]]` line, so the page is rendered live from the PDF.
 */
export async function createPdfPageAsset(
	app: App,
	proxy: ObsidianMarkdownFileTLAssetStoreProxy,
	file: TFile,
	page: number
): Promise<{ asset: TLImageAsset; blockRefId: BlockRefAssetId }> {
	const viewport = await getPdfPageViewport(app, file, page)
	const rendered = await getRenderedPdfPage(app, file, page)
	const blockRefId = await proxy.addLink(file, formatPdfSubpath(page))
	// tldraw resolves the asset immediately, before Obsidian indexes the new link line.
	proxy.primeCache(blockRefId, rendered.blob)

	const asset = createImageAsset({
		props: {
			isAnimated: false,
			mimeType: 'image/png',
			name: `${file.basename} (page ${page})`,
			src: `asset:${blockRefId}`,
			w: viewport.width,
			h: viewport.height,
		},
		meta: { pdf: { page } satisfies PdfPageAssetMeta },
	})

	return { asset, blockRefId }
}

/** The markdown asset proxy behind an editor, or undefined for `.tldr` drawings. */
export function getEditorAssetProxy(editor: Editor) {
	const assets: unknown = editor.store.props.assets
	return assets instanceof ObsidianTLAssetStore ? assets.proxy : undefined
}

/** The PDF file and page an image shape renders, if it's a PDF page. */
export function getShapePdfPage(
	editor: Editor,
	proxy: ObsidianMarkdownFileTLAssetStoreProxy,
	shape: TLImageShape
) {
	if (!shape.props.assetId) return undefined
	const asset = editor.getAsset(shape.props.assetId)
	const src = asset?.props.src
	if (!src?.startsWith('asset:')) return undefined

	const assetId = src.slice('asset:'.length)
	if (!ObsidianMarkdownFileTLAssetStoreProxy.isBlockRefId(assetId)) return undefined

	const resolved = proxy.resolveBlockRef(assetId)
	if (!resolved || resolved.file.extension !== 'pdf') return undefined

	return { file: resolved.file, page: pageFromSubpath(resolved.subpath) }
}
