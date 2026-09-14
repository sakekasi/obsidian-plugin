import { HoverParent, Notice } from 'obsidian'
import * as React from 'react'
import { ComponentType, useCallback, useEffect, useMemo } from 'react'
import TldrawPlugin from 'src/main'
import {
	hoverShapeLink,
	openShapeLink,
	resolveShapeLink,
	toEditableLinkText,
} from 'src/obsidian/links/open-link'
import { ObsidianMarkdownFileTLAssetStoreProxy } from 'src/tldraw/asset-store'
import { TLShapeId, useEditor, useValue } from 'tldraw'
import { linkEditorOpen } from './link-edit-state'
import { setShapesLink, toStoredShapeLink } from './link-storage'
import { getShapeLink, LinkHoverRequest, LinkMarkers, LinkOpenRequest } from './LinkMarkers'
import { LinkPopover } from './LinkPopover'

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

	const anchor = useValue(
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

	const hasAnchor = anchor !== undefined
	useEffect(() => {
		if (!hasAnchor) close()
	}, [hasAnchor, close])

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
		return link ? toEditableLinkText(resolve(link)) : undefined
	}, [editor, resolve])

	if (!anchor) return null

	const save = async (ids: TLShapeId[], text: string) => {
		try {
			const stored = await toStoredShapeLink(app, sourcePath, proxy, text)
			if (!stored) return
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
