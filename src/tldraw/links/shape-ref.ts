// Links to individual shapes: `[[drawing#^<id>]]`, where `<id>` is the shape id without
// its `shape:` prefix. Kept free of `obsidian` imports so it can be used from the gallery.

import { Editor, TLShape, TLShapeId } from 'tldraw'

const SHAPE_PREFIX = 'shape:'
const SHAPE_SUBPATH_PATTERN = /^#\^([\w-]+)$/

export interface ShapeOption {
	id: TLShapeId
	pageId: string
	/** Outline-panel name, frame name, or text; '' for shapes without any. */
	label: string
	kind: 'text' | 'frame' | 'shape'
	type: string
	/** Hidden from the canvas via the outline panel (`meta.hidden` on it or an ancestor). */
	isHidden: boolean
}

export function formatShapeSubpath(id: TLShapeId) {
	return `#^${id.slice(SHAPE_PREFIX.length)}`
}

export function parseShapeSubpath(subpath: string): TLShapeId | undefined {
	const match = SHAPE_SUBPATH_PATTERN.exec(subpath.trim())
	if (!match) return undefined
	return `${SHAPE_PREFIX}${match[1]}` as TLShapeId
}

/** What to show in a list: the label, or e.g. `Geo · abc123` for unlabelled shapes. */
export function shapeOptionTitle(option: ShapeOption) {
	if (option.label !== '') return option.label
	const type = option.type.charAt(0).toUpperCase() + option.type.slice(1)
	return `${type} · ${option.id.slice(SHAPE_PREFIX.length, SHAPE_PREFIX.length + 6)}`
}

type ShapeLike = Pick<TLShape, 'id' | 'type'> & { props?: unknown; meta?: Record<string, unknown> }

function toOption(shape: ShapeLike, pageId: string, text: string | undefined, isHidden: boolean): ShapeOption {
	const base = { id: shape.id, pageId, type: shape.type, isHidden }
	// A name given in the outline panel wins over everything else.
	const given = typeof shape.meta?.name === 'string' ? shape.meta.name.trim() : ''
	if (given) return { ...base, label: given, kind: shape.type === 'frame' ? 'frame' : 'shape' }
	const frameName = shape.type === 'frame' ? (shape.props as { name?: string } | undefined)?.name?.trim() : undefined
	if (frameName) return { ...base, label: frameName, kind: 'frame' }
	const label = text?.trim().replace(/\s+/g, ' ') ?? ''
	return { ...base, label, kind: label === '' ? 'shape' : 'text' }
}

export function shapeOptionsFromEditor(editor: Editor): ShapeOption[] {
	const isHidden = (shape: TLShape) =>
		[shape, ...editor.getShapeAncestors(shape)].some((s) => s.meta.hidden === true)
	return editor
		.getPages()
		.flatMap((page) =>
			[...editor.getPageShapeIds(page.id)]
				.map((id) => editor.getShape(id))
				.filter((shape): shape is TLShape => !!shape)
				.map((shape) => toOption(shape, page.id, editor.getShapeUtil(shape).getText(shape), isHidden(shape)))
		)
}

/** Switch to the shape's page, select it, and zoom to fit it. Returns false if it doesn't exist. */
export function focusShape(editor: Editor, id: TLShapeId) {
	if (!editor.getShape(id)) return false
	editor.setCurrentPage(editor.getAncestorPageId(id)!)
	editor.select(id)
	editor.zoomToSelection({ animation: { duration: 220 } })
	return true
}

/** Pan and zoom to a shape without changing the selection, for previews. */
export function previewShape(editor: Editor, id: TLShapeId) {
	const pageId = editor.getAncestorPageId(id)
	if (!pageId) return
	if (pageId !== editor.getCurrentPageId()) editor.setCurrentPage(pageId)
	const bounds = editor.getShapePageBounds(id)
	if (!bounds) return
	editor.zoomToBounds(bounds, { inset: 120, targetZoom: Math.min(1, editor.getZoomLevel()), animation: { duration: 160 } })
}

type RichTextNode ={ text?: unknown; content?: unknown }

function plainText(node: unknown): string {
	if (!node || typeof node !== 'object') return ''
	const { text, content } = node as RichTextNode
	const own = typeof text === 'string' ? text : ''
	const children = Array.isArray(content) ? content.map(plainText).join(' ') : ''
	return `${own} ${children}`.trim()
}

type RawRecord = {
	typeName?: string
	id?: string
	parentId?: string
	type?: string
	props?: Record<string, unknown>
	meta?: Record<string, unknown>
}

/**
 * Shapes from stored records (e.g. another drawing's `store.allRecords()` or a snapshot's
 * `store` object), without an editor.
 */
export function shapeOptionsFromSnapshot(raw: unknown): ShapeOption[] {
	if (!raw || typeof raw !== 'object') return []
	const store = Array.isArray(raw) ? raw : ((raw as { store?: unknown }).store ?? raw)
	const records = Object.values(store as Record<string, RawRecord>).filter(
		(r): r is RawRecord => !!r && typeof r === 'object'
	)
	const byId = new Map(records.map((r) => [r.id, r]))

	const pageOf = (record: RawRecord): string => {
		const parent = byId.get(record.parentId)
		if (!parent) return record.parentId ?? ''
		return parent.typeName === 'page' ? (parent.id ?? '') : pageOf(parent)
	}

	// Hiding a frame or group hides everything inside it.
	const isHidden = (record: RawRecord): boolean => {
		if (record.meta?.hidden === true) return true
		const parent = byId.get(record.parentId)
		return parent?.typeName === 'shape' && isHidden(parent)
	}

	return records
		.filter((r) => r.typeName === 'shape')
		.map((r) => {
			const props = r.props ?? {}
			const text = typeof props.text === 'string' ? props.text : plainText(props.richText)
			return toOption(r as unknown as ShapeLike, pageOf(r), text, isHidden(r))
		})
}
