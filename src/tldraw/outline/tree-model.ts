/**
 * Pure model for the outline (layers) panel. Nothing here touches the editor, so it can be
 * unit tested and reused by the React layer.
 *
 * Rows are displayed topmost-first (highest z-index at the top), matching Figma.
 */

export interface OutlineShape {
	id: string
	type: string
	parentId: string
	/** tldraw fractional index; string comparison gives z-order. */
	index: string
	name?: string
	text?: string
	isLocked: boolean
	isHidden: boolean
}

export interface OutlineNode {
	shape: OutlineShape
	label: string
	children: OutlineNode[]
}

export interface OutlineRow {
	id: string
	parentId: string
	depth: number
	node: OutlineNode
	hasChildren: boolean
	isExpanded: boolean
	/** True when an ancestor is hidden, so the row renders dimmed. */
	isInheritedHidden: boolean
}

export type DropZone = 'before' | 'after' | 'inside'

const TYPE_LABELS: Record<string, string> = {
	geo: 'Shape',
	draw: 'Drawing',
	highlight: 'Highlight',
	arrow: 'Arrow',
	line: 'Line',
	text: 'Text',
	note: 'Note',
	frame: 'Frame',
	group: 'Group',
	image: 'Image',
	video: 'Video',
	embed: 'Embed',
	bookmark: 'Bookmark',
}

export const CONTAINER_TYPES = new Set(['frame', 'group'])

const compareIndex = (a: OutlineShape, b: OutlineShape) =>
	a.index < b.index ? -1 : a.index > b.index ? 1 : 0

function typeLabel(type: string) {
	return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1)
}

function textLabel(text: string | undefined) {
	const firstLine = text?.trim().split('\n')[0]?.trim()
	if (!firstLine) return undefined
	return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
}

/**
 * Computes a label for every shape. Named shapes use their name, text shapes their first
 * line, and the rest get "Type N" numbered by z-order within the page (bottom-most is 1).
 */
export function labelShapes(shapes: OutlineShape[]): Map<string, string> {
	const sorted = [...shapes].sort(compareIndex)
	const counters = new Map<string, number>()
	return new Map(
		sorted.map((shape) => {
			const explicit = shape.name?.trim() || textLabel(shape.text)
			if (explicit) return [shape.id, explicit]
			const n = (counters.get(shape.type) ?? 0) + 1
			counters.set(shape.type, n)
			return [shape.id, `${typeLabel(shape.type)} ${n}`]
		})
	)
}

/** Builds the nested tree for one page, children sorted topmost-first. */
export function buildTree(shapes: OutlineShape[], pageId: string): OutlineNode[] {
	const labels = labelShapes(shapes)
	const byParent = shapes.reduce((acc, shape) => {
		const list = acc.get(shape.parentId) ?? []
		list.push(shape)
		acc.set(shape.parentId, list)
		return acc
	}, new Map<string, OutlineShape[]>())

	const build = (parentId: string): OutlineNode[] =>
		[...(byParent.get(parentId) ?? [])]
			.sort((a, b) => compareIndex(b, a))
			.map((shape) => ({
				shape,
				label: labels.get(shape.id) ?? shape.type,
				children: build(shape.id),
			}))

	return build(pageId)
}

function matchesFilter(node: OutlineNode, needle: string): boolean {
	if (node.label.toLowerCase().includes(needle)) return true
	return node.children.some((child) => matchesFilter(child, needle))
}

/**
 * Flattens the tree into display rows. With a filter, only matching nodes and their ancestors
 * are kept, and ancestors are force-expanded so matches are visible.
 */
export function flattenVisible(
	tree: OutlineNode[],
	expanded: ReadonlySet<string>,
	filter = ''
): OutlineRow[] {
	const needle = filter.trim().toLowerCase()

	const walk = (
		nodes: OutlineNode[],
		parentId: string,
		depth: number,
		hiddenAbove: boolean
	): OutlineRow[] =>
		nodes
			.filter((node) => !needle || matchesFilter(node, needle))
			.flatMap((node) => {
				const hasChildren = node.children.length > 0
				const isExpanded = hasChildren && (needle ? true : expanded.has(node.shape.id))
				const row: OutlineRow = {
					id: node.shape.id,
					parentId,
					depth,
					node,
					hasChildren,
					isExpanded,
					isInheritedHidden: hiddenAbove,
				}
				if (!isExpanded) return [row]
				const hidden = hiddenAbove || node.shape.isHidden
				return [row, ...walk(node.children, node.shape.id, depth + 1, hidden)]
			})

	const pageId = tree[0]?.shape.parentId ?? ''
	return walk(tree, pageId, 0, false)
}

/** All ids of nodes with children, for expand-all / subtree toggles. */
export function containerIds(tree: OutlineNode[]): string[] {
	return tree.flatMap((node) =>
		node.children.length ? [node.shape.id, ...containerIds(node.children)] : []
	)
}

export function findNode(tree: OutlineNode[], id: string): OutlineNode | undefined {
	return tree.reduce<OutlineNode | undefined>(
		(found, node) => found ?? (node.shape.id === id ? node : findNode(node.children, id)),
		undefined
	)
}

/** Ids of the visible rows between anchor and target, inclusive, in display order. */
export function rangeSelect(rows: OutlineRow[], anchorId: string, targetId: string): string[] {
	const a = rows.findIndex((r) => r.id === anchorId)
	const b = rows.findIndex((r) => r.id === targetId)
	if (b === -1) return []
	if (a === -1) return [targetId]
	const [start, end] = a < b ? [a, b] : [b, a]
	return rows.slice(start, end + 1).map((r) => r.id)
}

export function nextRow(rows: OutlineRow[], id: string | undefined): OutlineRow | undefined {
	if (!id) return rows[0]
	const i = rows.findIndex((r) => r.id === id)
	return rows[Math.min(i + 1, rows.length - 1)]
}

export function prevRow(rows: OutlineRow[], id: string | undefined): OutlineRow | undefined {
	if (!id) return rows[rows.length - 1]
	const i = rows.findIndex((r) => r.id === id)
	return rows[Math.max(i - 1, 0)]
}

export function parentRow(rows: OutlineRow[], id: string): OutlineRow | undefined {
	const row = rows.find((r) => r.id === id)
	if (!row) return undefined
	return rows.find((r) => r.id === row.parentId)
}

/**
 * Which part of a row the pointer is over. Containers have a middle "inside" band; other rows
 * split in half.
 */
export function dropZone(
	rowTop: number,
	rowHeight: number,
	pointerY: number,
	canContain: boolean
): DropZone {
	const t = (pointerY - rowTop) / rowHeight
	if (!canContain) return t < 0.5 ? 'before' : 'after'
	if (t < 0.25) return 'before'
	if (t > 0.75) return 'after'
	return 'inside'
}

export interface DropPlacement {
	parentId: string
	/** Index to insert above (lower z). Undefined means bottom of the parent. */
	below?: string
	/** Index to insert beneath (higher z). Undefined means top of the parent. */
	above?: string
}

/**
 * Resolves a drop into a parent plus the two neighbouring indexes to insert between.
 * "before" is visually above the target, so it lands at a higher z-index.
 */
export function dropPlacement(
	tree: OutlineNode[],
	pageId: string,
	target: OutlineRow,
	zone: DropZone,
	draggedIds: ReadonlySet<string>
): DropPlacement {
	if (zone === 'inside') {
		const top = target.node.children.find((c) => !draggedIds.has(c.shape.id))
		return { parentId: target.id, below: top?.shape.index }
	}

	const parent = findNode(tree, target.parentId)
	const siblings = (parent ? parent.children : tree).filter(
		(n) => n.shape.id === target.id || !draggedIds.has(n.shape.id)
	)
	const i = siblings.findIndex((n) => n.shape.id === target.id)
	const parentId = parent ? parent.shape.id : pageId

	if (zone === 'before') {
		return { parentId, below: target.node.shape.index, above: siblings[i - 1]?.shape.index }
	}
	return { parentId, below: siblings[i + 1]?.shape.index, above: target.node.shape.index }
}

/** A shape can't be dropped into itself or its own descendants. */
export function isDescendantOrSelf(tree: OutlineNode[], ancestorId: string, id: string) {
	const ancestor = findNode(tree, ancestorId)
	return !!ancestor && !!findNode([ancestor], id)
}
