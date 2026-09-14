import { HoverParent, Notice } from 'obsidian'
import * as React from 'react'
import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TldrawPlugin from 'src/main'
import { parseLink } from 'src/obsidian/links/link-ref'
import { processInitialData } from 'src/tldraw/helpers'
import { getTLMetaTemplate } from 'src/utils/document'
import { migrateTldrawFileDataIfNecessary } from 'src/utils/migrate/tl-data-to-tlstore'
import { parseTLDataDocument } from 'src/utils/parse'
import {
	hoverShapeLink,
	openShapeLink,
	resolveShapeLink,
	toEditableLinkText,
} from 'src/obsidian/links/open-link'
import { ObsidianMarkdownFileTLAssetStoreProxy } from 'src/tldraw/asset-store'
import { TLCamera, TLDRAW_FILE_EXTENSION, TLPageId, TLShapeId, useEditor, useValue } from 'tldraw'
import { linkEditorOpen } from './link-edit-state'
import { setShapesLink, toStoredShapeLink } from './link-storage'
import { getShapeLink, LinkHoverRequest, LinkMarkers, LinkOpenRequest } from './LinkMarkers'
import { LinkPopover } from './LinkPopover'
import { previewShape, ShapeOption, shapeOptionsFromEditor, shapeOptionsFromSnapshot } from './shape-ref'

interface LinkLayerContext {
	plugin: TldrawPlugin
	sourcePath: string
	proxy?: ObsidianMarkdownFileTLAssetStoreProxy
}

/**
 * Builds the `InFrontOfTheCanvas` component that shows link markers, opens and previews
 * links, and hosts the link popover.
 */
export function createLinkLayer(context: LinkLayerContext): ComponentType {
	const hoverParent: HoverParent = { hoverPopover: null }

	return function LinkLayer() {
		const editor = useEditor()
		const { plugin, sourcePath, proxy } = context
		const app = plugin.app
		const isEditing = useValue('link editor open', () => linkEditorOpen(editor).get(), [editor])

		const resolve = useCallback(
			(link: string) => resolveShapeLink(app, sourcePath, proxy, link),
			[app]
		)

		const onOpen = useCallback(
			({ link, newTab }: LinkOpenRequest) => {
				const resolved = resolve(link)
				if (!resolved) {
					new Notice('This link no longer points to anything.')
					return
				}
				void openShapeLink(app, resolved, newTab)
			},
			[app, resolve]
		)

		const onHover = useCallback(
			({ link, event }: LinkHoverRequest) => {
				const resolved = resolve(link)
				if (!resolved) return
				hoverShapeLink(app, resolved, event.nativeEvent, hoverParent, event.currentTarget as HTMLElement)
			},
			[app, resolve]
		)

		return (
			<>
				<LinkMarkers onOpen={onOpen} onHover={onHover} />
				{isEditing && <LinkEditOverlay context={context} resolve={resolve} />}
			</>
		)
	}
}

function LinkEditOverlay({
	context: { plugin, sourcePath, proxy },
	resolve,
}: {
	context: LinkLayerContext
	resolve: (link: string) => ReturnType<typeof resolveShapeLink>
}) {
	const editor = useEditor()
	const app = plugin.app
	const close = useCallback(() => linkEditorOpen(editor).set(false), [editor])

	// Where the camera was before previewing shapes, so it can be put back.
	const origin = useRef<{ pageId: TLPageId; camera: TLCamera; ids: TLShapeId[] } | undefined>(undefined)
	const [previewing, setPreviewing] = useState(false)
	const frozenAnchor = useRef<{ ids: TLShapeId[]; x: number; y: number } | undefined>(undefined)

	const liveAnchor = useValue(
		'link popover anchor',
		() => {
			const ids = editor.getSelectedShapeIds()
			const bounds = editor.getSelectionPageBounds()
			if (ids.length === 0 || !bounds) return undefined
			const point = editor.pageToViewport({ x: bounds.midX, y: bounds.maxY })
			return { ids, x: point.x, y: point.y }
		},
		[editor]
	)
	// While previewing, the camera (and maybe the page) moves away from the selection; keep the popover still.
	if (!previewing) frozenAnchor.current = liveAnchor
	const anchor = previewing ? frozenAnchor.current : liveAnchor

	const hasAnchor = anchor !== undefined
	useEffect(() => {
		if (!hasAnchor) close()
	}, [hasAnchor, close])

	const restoreCamera = useCallback(() => {
		const saved = origin.current
		origin.current = undefined
		setPreviewing(false)
		if (!saved) return
		editor.setCurrentPage(saved.pageId)
		editor.setCamera(saved.camera, { animation: { duration: 160 } })
		editor.select(...saved.ids)
	}, [editor])

	const onPreviewShape = useCallback(
		(option: ShapeOption) => {
			if (!origin.current) {
				origin.current = {
					pageId: editor.getCurrentPageId(),
					camera: editor.getCamera(),
					ids: editor.getSelectedShapeIds(),
				}
				setPreviewing(true)
			}
			previewShape(editor, option.id)
		},
		[editor]
	)

	const getShapeOptions = useCallback(
		async (path: string): Promise<ShapeOption[]> => {
			if (path === '') return shapeOptionsFromEditor(editor)
			const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath)
			if (!file) return []
			if (file.path === sourcePath) return shapeOptionsFromEditor(editor)
			const isMarkdownDrawing = plugin.isTldrawFile(file)
			if (!isMarkdownDrawing && file.extension !== TLDRAW_FILE_EXTENSION.slice(1)) return []
			const data = await app.vault.cachedRead(file)
			const { store } = isMarkdownDrawing
				? processInitialData(parseTLDataDocument(plugin.manifest.version, data))
				: processInitialData({
						meta: getTLMetaTemplate(plugin.manifest.version),
						...(data.length === 0 ? { raw: undefined } : { store: migrateTldrawFileDataIfNecessary(data) }),
					})
			return shapeOptionsFromSnapshot(store.allRecords())
		},
		[app, editor, plugin, sourcePath]
	)

	const files = useMemo(
		() =>
			app.vault.getFiles().map((file) => ({
				path: file.path,
				basename: file.basename,
				extension: file.extension,
			})),
		[app]
	)

	// Read once when the popover opens, so edits to the selection don't reset the input.
	const initialLink = useMemo(() => {
		const link = editor
			.getSelectedShapes()
			.map(getShapeLink)
			.find((l): l is string => l !== undefined)
		return link ? toEditableLinkText(resolve(link), sourcePath) : undefined
	}, [editor, resolve])

	if (!anchor) return null

	const save = async (ids: TLShapeId[], text: string) => {
		try {
			// `#^id` on its own links to a shape in this drawing.
			const parsed = parseLink(text)
			const withPath =
				parsed?.kind === 'vault' && parsed.path === '' && sourcePath !== ''
					? `[[${sourcePath}${parsed.subpath}]]`
					: text
			const stored = await toStoredShapeLink(app, sourcePath, proxy, withPath)
			if (!stored) return
			restoreCamera()
			setShapesLink(editor, ids, stored)
			close()
		} catch (error) {
			console.error('Unable to save link', error)
			new Notice('Unable to save link. See the developer console for details.')
		}
	}

	return (
		<div
			className="ptl-link-popover-anchor"
			style={{ transform: `translate(${anchor.x}px, ${anchor.y + 12}px)` }}
			onPointerDown={(evt) => evt.stopPropagation()}
			onKeyDown={(evt) => evt.stopPropagation()}
		>
			<LinkPopover
				files={files}
				initialLink={initialLink}
				getShapeOptions={getShapeOptions}
				onPreviewShape={onPreviewShape}
				onPreviewEnd={restoreCamera}
				onCancel={close}
				onRemove={() => {
					setShapesLink(editor, anchor.ids, null)
					close()
				}}
				onSave={(text) => void save(anchor.ids, text)}
			/>
		</div>
	)
}
