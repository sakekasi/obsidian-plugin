import { App, TFile } from 'obsidian'
import { ObsidianMarkdownFileTLAssetStoreProxy } from 'src/tldraw/asset-store'
import { createShapeId, Editor, TLImageAsset, VecLike } from 'tldraw'
import { createPdfPageAsset } from './pdf-assets'

const PAGE_GAP = 24

/**
 * Add PDF pages to the canvas as a single row of image shapes centered on `point`.
 * Each page's image and link point at the same `[[file.pdf#page=N]]` line.
 */
export async function insertPdfPages(
	editor: Editor,
	app: App,
	proxy: ObsidianMarkdownFileTLAssetStoreProxy,
	file: TFile,
	{ pages, scale }: { pages: number[]; scale: number },
	point: VecLike
) {
	if (pages.length === 0) return

	// One at a time: each call edits the markdown file.
	const created = await pages.reduce<Promise<{ asset: TLImageAsset; blockRefId: string }[]>>(
		async (acc, page) => [...(await acc), await createPdfPageAsset(app, proxy, file, page)],
		Promise.resolve([])
	)

	const sizes = created.map(({ asset }) => ({ w: asset.props.w * scale, h: asset.props.h * scale }))
	const xs = sizes.reduce<number[]>(
		(acc, _size, i) => [...acc, i === 0 ? 0 : acc[i - 1] + sizes[i - 1].w + PAGE_GAP],
		[]
	)
	const totalWidth = xs[xs.length - 1] + sizes[sizes.length - 1].w
	const maxHeight = Math.max(...sizes.map((size) => size.h))
	const shapeIds = created.map(() => createShapeId())

	editor.markHistoryStoppingPoint('insert-pdf-pages')
	editor.run(() => {
		editor.createAssets(created.map(({ asset }) => asset))
		editor.createShapes(
			created.map(({ asset, blockRefId }, i) => ({
				id: shapeIds[i],
				type: 'image' as const,
				x: point.x - totalWidth / 2 + xs[i],
				y: point.y - maxHeight / 2,
				props: { assetId: asset.id, w: sizes[i].w, h: sizes[i].h },
				meta: { link: blockRefId },
			}))
		)
		editor.select(...shapeIds)
	})
}
