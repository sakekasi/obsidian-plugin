import * as React from 'react'
import { MouseEvent, useEffect } from 'react'
import { Box, TldrawUiIcon, TLEventInfo, TLShape, TLShapeId, useEditor, useValue } from 'tldraw'

export interface LinkOpenRequest {
	shape: TLShape
	link: string
	newTab: boolean
}

export interface LinkHoverRequest {
	shape: TLShape
	link: string
	event: MouseEvent
}

export interface LinkMarkersProps {
	onOpen: (request: LinkOpenRequest) => void
	onHover?: (request: LinkHoverRequest) => void
}

const MARKER_SIZE = 18
const MARKER_GAP = 2

export function getShapeLink(shape: TLShape): string | undefined {
	const link = shape.meta.link
	if (typeof link !== 'string' || link === '') return undefined
	return link
}

interface Marker {
	id: TLShapeId
	link: string
	x: number
	y: number
}

/**
 * Draws an external-link marker just outside the top-right corner of every shape
 * with `meta.link`, and opens links on Cmd/Ctrl-click of the shape itself.
 * Render it from the `InFrontOfTheCanvas` component override.
 */
export function LinkMarkers({ onOpen, onHover }: LinkMarkersProps) {
	const editor = useEditor()

	const markers = useValue<Marker[]>(
		'link markers',
		() => {
			const viewport = editor.getViewportPageBounds()
			const editingId = editor.getEditingShapeId()
			return editor
				.getCurrentPageShapesSorted()
				.filter((shape) => shape.id !== editingId && getShapeLink(shape) !== undefined)
				.map((shape) => ({ shape, bounds: editor.getShapePageBounds(shape) }))
				.filter((entry): entry is { shape: TLShape; bounds: Box } => !!entry.bounds && viewport.collides(entry.bounds))
				.map(({ shape, bounds }) => {
					const corner = editor.pageToViewport({ x: bounds.maxX, y: bounds.minY })
					return { id: shape.id, link: getShapeLink(shape)!, x: corner.x, y: corner.y }
				})
		},
		[editor]
	)

	useEffect(() => {
		const handleEvent = (info: TLEventInfo) => {
			if (info.type !== 'pointer' || info.name !== 'pointer_down') return
			if (!info.accelKey) return

			const shape =
				info.target === 'shape'
					? info.shape
					: editor.getShapeAtPoint(editor.screenToPage(info.point), { hitInside: true })
			if (!shape) return

			const link = getShapeLink(shape)
			if (!link) return

			onOpen({ shape, link, newTab: info.shiftKey })
		}

		editor.on('event', handleEvent)
		return () => {
			editor.off('event', handleEvent)
		}
	}, [editor, onOpen])

	const withShape = (id: TLShapeId, cb: (shape: TLShape) => void) => {
		const shape = editor.getShape(id)
		if (!shape) return
		cb(shape)
	}

	return (
		<div className="ptl-link-markers">
			{markers.map((marker) => (
				<button
					key={marker.id}
					className="ptl-link-marker"
					title={marker.link}
					aria-label={`Open ${marker.link}`}
					style={{
						transform: `translate(${marker.x + MARKER_GAP}px, ${marker.y - MARKER_SIZE - MARKER_GAP}px)`,
					}}
					onPointerDown={(evt) => evt.stopPropagation()}
					onClick={(evt) =>
						withShape(marker.id, (shape) =>
							onOpen({ shape, link: marker.link, newTab: evt.metaKey || evt.ctrlKey || evt.shiftKey })
						)
					}
					onMouseEnter={(evt) =>
						withShape(marker.id, (shape) => onHover?.({ shape, link: marker.link, event: evt }))
					}
				>
					<TldrawUiIcon icon="external-link" label="Open link" small />
				</button>
			))}
		</div>
	)
}
