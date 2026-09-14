import { ComponentType, useEffect } from 'react'
import TldrawPlugin from 'src/main'
import { formatPdfSubpath } from 'src/obsidian/links/link-ref'
import { cropToPdfRect, isFullCrop } from 'src/obsidian/pdf/crop-rect'
import { getPdfPageViewport } from 'src/obsidian/pdf/pdf-services'
import { ObsidianMarkdownFileTLAssetStoreProxy } from 'src/tldraw/asset-store'
import { getShapeLink } from 'src/tldraw/links/LinkMarkers'
import { TLImageShape, TLShape, TLShapeId, useEditor } from 'tldraw'
import { getShapePdfPage } from './pdf-assets'

const SYNC_DELAY_MS = 600

function isImageShape(shape: TLShape): shape is TLImageShape {
	return shape.type === 'image'
}

/**
 * Keeps a PDF page image's link in step with its crop: cropping writes `&rect=` so
 * Cmd-click opens the PDF at the cropped region's page. The image itself always renders
 * the full page, so tldraw's crop remains the source of truth.
 */
export function createPdfCropSync(
	plugin: TldrawPlugin,
	proxy: ObsidianMarkdownFileTLAssetStoreProxy | undefined
): ComponentType {
	return function PdfCropSync() {
		const editor = useEditor()

		useEffect(() => {
			if (!proxy) return

			const timers = new Map<TLShapeId, number>()

			const sync = async (id: TLShapeId) => {
				timers.delete(id)
				if (editor.getIsReadonly()) return

				const shape = editor.getShape(id)
				if (!shape || !isImageShape(shape)) return

				const pdf = getShapePdfPage(editor, proxy, shape)
				if (!pdf) return

				const { crop } = shape.props
				const subpath = isFullCrop(crop)
					? formatPdfSubpath(pdf.page)
					: formatPdfSubpath(pdf.page, cropToPdfRect(crop!, await getPdfPageViewport(plugin.app, pdf.file, pdf.page)))

				const currentLink = getShapeLink(shape)
				const current =
					currentLink && ObsidianMarkdownFileTLAssetStoreProxy.isBlockRefId(currentLink)
						? proxy.resolveBlockRef(currentLink)
						: undefined
				if (current?.file.path === pdf.file.path && current.subpath === subpath) return

				// A new line rather than an in-place edit: duplicated shapes may share the old one.
				const link = await proxy.addLink(pdf.file, subpath)
				if (!editor.getShape(id)) return
				editor.run(() => editor.updateShape({ id, type: shape.type, meta: { link } }), {
					history: 'ignore',
				})
			}

			const removeHandler = editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
				if (!isImageShape(prev) || !isImageShape(next)) return
				if (JSON.stringify(prev.props.crop) === JSON.stringify(next.props.crop)) return

				window.clearTimeout(timers.get(next.id))
				timers.set(
					next.id,
					window.setTimeout(() => {
						sync(next.id).catch((error) => console.error('Unable to sync PDF crop to link', error))
					}, SYNC_DELAY_MS)
				)
			})

			return () => {
				removeHandler()
				timers.forEach((timer) => window.clearTimeout(timer))
			}
		}, [editor])

		return null
	}
}
