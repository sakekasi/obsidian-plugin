import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Editor, getIndicesBetween, IndexKey, TLParentId, TLShapeId, useEditor, useValue } from 'tldraw'
import { IconButton, RenameInput } from './controls'
import { Icon, ShapeTypeIcon } from './icons'
import {
	buildTree,
	containerIds,
	CONTAINER_TYPES,
	DropPlacement,
	dropPlacement,
	DropZone,
	dropZone,
	findNode,
	flattenVisible,
	isDescendantOrSelf,
	nextRow,
	OutlineRow,
	parentRow,
	prevRow,
	rangeSelect,
} from './tree-model'
import { useOutlineShapes } from './use-outline'
import { renameShape, toggleHidden } from './visibility'

function moveShapes(editor: Editor, bottomToTopIds: TLShapeId[], placement: DropPlacement) {
	if (!bottomToTopIds.length) return
	editor.markHistoryStoppingPoint('outline move')
	editor.run(
		() => {
			editor.reparentShapes(bottomToTopIds, placement.parentId as TLParentId)
			const indices = getIndicesBetween(
				placement.below as IndexKey | undefined,
				placement.above as IndexKey | undefined,
				bottomToTopIds.length
			)
			editor.updateShapes(
				bottomToTopIds.map((id, i) => ({ id, type: editor.getShape(id)!.type, index: indices[i] }))
			)
		},
		{ ignoreShapeLock: true }
	)
}

/**
 * Scrolls only the list (scrollIntoView would also scroll the page/app). Rows already in view
 * stay put; rows out of view are centred.
 */
function scrollRowIntoView(list: HTMLElement, rowEl: HTMLElement) {
	const listRect = list.getBoundingClientRect()
	const rowRect = rowEl.getBoundingClientRect()
	if (rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom) return
	const offset = rowRect.top - listRect.top - (listRect.height - rowRect.height) / 2
	// Instant: a smooth scroll gets cut short by the re-renders that follow a selection change.
	list.scrollTop += offset
}

/** Opens tldraw's own canvas context menu at the pointer, so the menu matches the canvas. */
function openCanvasContextMenu(editor: Editor, clientX: number, clientY: number) {
	const canvas = editor.getContainer().querySelector('.tl-canvas')
	const MouseEventCtor = canvas?.ownerDocument.defaultView?.MouseEvent
	if (!canvas || !MouseEventCtor) return
	editor.timers.requestAnimationFrame(() =>
		canvas.dispatchEvent(
			new MouseEventCtor('contextmenu', { bubbles: true, cancelable: true, clientX, clientY, button: 2 })
		)
	)
}

export function LayersSection() {
	const editor = useEditor()
	const { shapes, pageId } = useOutlineShapes(editor)
	const tree = useMemo(() => buildTree(shapes, pageId), [shapes, pageId])

	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
	const [filter, setFilter] = useState('')
	const [isSearching, setIsSearching] = useState(false)
	const rows = useMemo(() => flattenVisible(tree, expanded, filter), [tree, expanded, filter])

	const selectedIds = useValue('outline selection', () => editor.getSelectedShapeIds(), [editor])
	const selected = useMemo(() => new Set<string>(selectedIds), [selectedIds])
	const hoveredId = useValue('outline hovered', () => editor.getHoveredShapeId(), [editor])
	const isReadonly = useValue('outline readonly', () => editor.getIsReadonly(), [editor])
	// A shape hovered on the canvas may sit inside a collapsed parent; light its nearest visible row.
	const hoveredRowId = useMemo(() => {
		if (!hoveredId) return undefined
		const rowIds = new Set(rows.map((r) => r.id))
		const nearestFirst = editor.getShapeAncestors(hoveredId).map((s) => s.id).reverse()
		return [hoveredId, ...nearestFirst].find((id) => rowIds.has(id))
	}, [editor, hoveredId, rows])

	// Selected rows and the descendants of selected rows are "lit". Adjacent lit rows render as
	// one block, so only the first and last in a run get rounded corners.
	const highlight = useMemo(() => {
		const lit = rows.reduce((acc, row) => {
			if (selected.has(row.id) || acc.has(row.parentId)) acc.add(row.id)
			return acc
		}, new Set<string>())
		const isLit = (i: number) => !!rows[i] && lit.has(rows[i].id)
		return new Map(
			rows.map((row, i) => [
				row.id,
				{
					isAncestorSelected: lit.has(row.id) && !selected.has(row.id),
					isRunStart: isLit(i) && !isLit(i - 1),
					isRunEnd: isLit(i) && !isLit(i + 1),
				},
			])
		)
	}, [rows, selected])

	// anchor: where a shift-range starts; cursor: the row arrow keys move from.
	const anchorRef = useRef<string | undefined>(undefined)
	const cursorRef = useRef<string | undefined>(undefined)
	const [renamingId, setRenamingId] = useState<string>()
	const [drop, setDrop] = useState<{ id: string; zone: DropZone }>()
	const dragIdsRef = useRef<ReadonlySet<string>>(new Set())
	const listRef = useRef<HTMLDivElement>(null)
	const pendingScrollRef = useRef<string | undefined>(undefined)

	// Canvas → tree: reveal and scroll to the selection.
	useEffect(() => {
		const last = selectedIds[selectedIds.length - 1]
		if (!last) return
		const ancestors = selectedIds.flatMap((id) => editor.getShapeAncestors(id).map((s) => s.id))
		setExpanded((prev) =>
			ancestors.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ancestors])
		)
		pendingScrollRef.current = last
	}, [editor, selectedIds])

	// The row may only exist after the ancestor expansion above re-renders, so retry on row changes.
	useEffect(() => {
		const id = pendingScrollRef.current
		const list = listRef.current
		if (!id || !list) return
		const rowEl = list.querySelector<HTMLElement>(`[data-shape-id="${CSS.escape(id)}"]`)
		if (!rowEl) return
		pendingScrollRef.current = undefined
		scrollRowIntoView(list, rowEl)
	}, [rows, selectedIds])

	const selectIds = useCallback(
		(ids: string[]) => {
			if (!editor.isIn('select')) editor.setCurrentTool('select')
			editor.setSelectedShapes(ids as TLShapeId[])
		},
		[editor]
	)

	const selectOne = (id: string) => {
		anchorRef.current = id
		cursorRef.current = id
		selectIds([id])
	}

	const setExpandedFor = (id: string, open: boolean, subtree = false) =>
		setExpanded((prev) => {
			const node = subtree ? findNode(tree, id) : undefined
			const ids = node ? [id, ...containerIds(node.children)] : [id]
			const next = new Set(prev)
			ids.forEach((i) => (open ? next.add(i) : next.delete(i)))
			return next
		})

	const focusList = () => listRef.current?.focus({ preventScroll: true })

	const onRowClick = (e: React.MouseEvent, row: OutlineRow) => {
		focusList()
		if (e.shiftKey) {
			cursorRef.current = row.id
			selectIds(rangeSelect(rows, anchorRef.current ?? row.id, row.id))
			return
		}
		if (!(e.metaKey || e.ctrlKey)) return selectOne(row.id)
		anchorRef.current = row.id
		cursorRef.current = row.id
		selectIds(
			selected.has(row.id) ? selectedIds.filter((id) => id !== row.id) : [...selectedIds, row.id]
		)
	}

	const handleKey = (e: React.KeyboardEvent): boolean => {
		const focusId =
			cursorRef.current && selected.has(cursorRef.current)
				? cursorRef.current
				: selectedIds[selectedIds.length - 1]
		const current = rows.find((r) => r.id === focusId)

		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowUp': {
				const target = e.key === 'ArrowDown' ? nextRow(rows, current?.id) : prevRow(rows, current?.id)
				if (!target) return true
				if (!e.shiftKey || !anchorRef.current) {
					selectOne(target.id)
					return true
				}
				cursorRef.current = target.id
				selectIds(rangeSelect(rows, anchorRef.current, target.id))
				return true
			}
			case 'ArrowLeft': {
				if (!current) return false
				if (current.isExpanded) {
					setExpandedFor(current.id, false, e.altKey)
					return true
				}
				const parent = parentRow(rows, current.id)
				if (parent) selectOne(parent.id)
				return true
			}
			case 'ArrowRight': {
				if (!current) return false
				if (!current.hasChildren) return true
				if (!current.isExpanded) {
					setExpandedFor(current.id, true, e.altKey)
					return true
				}
				const child = nextRow(rows, current.id)
				if (child) selectOne(child.id)
				return true
			}
			case ' ':
			case 'Enter':
				if (!current || isReadonly) return false
				setRenamingId(current.id)
				return true
			case 'Escape':
				selectIds([])
				return true
			case 'Backspace':
			case 'Delete':
				if (!selectedIds.length || isReadonly) return false
				editor.markHistoryStoppingPoint('outline delete')
				editor.deleteShapes(selectedIds)
				return true
			default:
				return false
		}
	}

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (renamingId) return
		if (!handleKey(e)) return
		e.preventDefault()
		e.stopPropagation()
	}

	const onRowContextMenu = (e: React.MouseEvent, row: OutlineRow) => {
		e.preventDefault()
		e.stopPropagation()
		if (!selected.has(row.id)) selectOne(row.id)
		openCanvasContextMenu(editor, e.clientX, e.clientY)
	}

	const commitRename = (row: OutlineRow, value: string) => {
		setRenamingId(undefined)
		focusList()
		// Leaving the generated fallback label untouched shouldn't pin it as a name.
		if (!row.node.shape.name && value.trim() === row.node.label) return
		renameShape(editor, row.id as TLShapeId, value)
	}

	const canDropOn = (row: OutlineRow, zone: DropZone) => {
		const dragged = dragIdsRef.current
		if (!dragged.size) return false
		const candidateParent = zone === 'inside' ? row.id : row.parentId
		return ![...dragged].some((id) => isDescendantOrSelf(tree, id, candidateParent))
	}

	const onDragStart = (e: React.DragEvent, row: OutlineRow) => {
		if (renamingId || isReadonly) return e.preventDefault()
		const ids = selected.has(row.id) ? selectedIds : [row.id]
		if (!selected.has(row.id)) selectOne(row.id)
		dragIdsRef.current = new Set(ids)
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('application/x-ptl-outline', ids.join(','))
	}

	const rowForEvent = (e: DragEvent) => {
		const rowEl = (e.target as Element | null)?.closest('[data-shape-id]')
		const row = rows.find((r) => r.id === rowEl?.getAttribute('data-shape-id'))
		if (!rowEl || !row) return undefined
		const rect = rowEl.getBoundingClientRect()
		const zone = dropZone(rect.top, rect.height, e.clientY, CONTAINER_TYPES.has(row.node.shape.type))
		return { row, zone }
	}

	const onDragOver = (e: DragEvent) => {
		const hit = rowForEvent(e)
		if (!hit || !canDropOn(hit.row, hit.zone)) return setDrop(undefined)
		e.preventDefault()
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
		setDrop((prev) =>
			prev?.id === hit.row.id && prev.zone === hit.zone ? prev : { id: hit.row.id, zone: hit.zone }
		)
	}

	const endDrag = () => {
		setDrop(undefined)
		dragIdsRef.current = new Set()
	}

	const onDrop = (e: DragEvent) => {
		e.preventDefault()
		const hit = rowForEvent(e)
		const isAllowed = !!hit && canDropOn(hit.row, hit.zone)
		const dragged = dragIdsRef.current
		endDrag()
		if (!hit || !isAllowed) return
		const { row, zone } = hit

		// Moving a container moves its children with it, so drop descendants of other dragged ids.
		const roots = [...dragged].filter(
			(id) => !editor.getShapeAncestors(id as TLShapeId).some((a) => dragged.has(a.id))
		)
		const displayOrder = new Map(rows.map((r, i) => [r.id, i]))
		const bottomToTop = [...roots].sort(
			(a, b) => (displayOrder.get(b) ?? -1) - (displayOrder.get(a) ?? -1)
		) as TLShapeId[]

		if (zone === 'inside') setExpandedFor(row.id, true)
		moveShapes(editor, bottomToTop, dropPlacement(tree, pageId, row, zone, dragged))
	}

	// tldraw's container intercepts dragover/drop natively (re-dispatching them to the canvas),
	// so React never sees them. Listen on the list itself, which receives them first.
	const dragHandlers = useRef({ onDragOver, onDrop })
	dragHandlers.current = { onDragOver, onDrop }
	useEffect(() => {
		const list = listRef.current
		if (!list) return
		const over = (e: DragEvent) => {
			if (!dragIdsRef.current.size) return
			e.stopPropagation()
			dragHandlers.current.onDragOver(e)
		}
		const dropped = (e: DragEvent) => {
			if (!dragIdsRef.current.size) return
			e.stopPropagation()
			dragHandlers.current.onDrop(e)
		}
		list.addEventListener('dragover', over)
		list.addEventListener('drop', dropped)
		return () => {
			list.removeEventListener('dragover', over)
			list.removeEventListener('drop', dropped)
		}
	}, [])

	return (
		<section className="ptl-outline-section ptl-outline-layers">
			<div className="ptl-outline-section__header">
				{isSearching ? (
					<input
						className="ptl-outline-search"
						autoFocus
						value={filter}
						placeholder="Find layers"
						onChange={(e) => setFilter(e.target.value)}
						onKeyDown={(e) => {
							e.stopPropagation()
							if (e.key !== 'Escape') return
							setFilter('')
							setIsSearching(false)
						}}
					/>
				) : (
					<span className="ptl-outline-section__title">Layers</span>
				)}
				<IconButton
					title="Find layers"
					isActive={isSearching}
					onClick={() => {
						setFilter('')
						setIsSearching((s) => !s)
					}}
				>
					<Icon.Search />
				</IconButton>
				<IconButton title="Collapse all" onClick={() => setExpanded(new Set())}>
					<Icon.CollapseAll />
				</IconButton>
			</div>
			<div
				ref={listRef}
				className="ptl-outline-list"
				role="tree"
				aria-label="Layers"
				aria-multiselectable
				tabIndex={0}
				// tldraw only runs its shortcuts (Cmd+D, undo…) while the editor is marked focused.
				// Mark it without moving DOM focus off the list, so arrow keys keep working here.
				onFocus={() => editor.focus({ focusContainer: false })}
				onKeyDown={onKeyDown}
				onClick={(e) => {
					if (e.target === e.currentTarget) selectIds([])
				}}
				onDragLeave={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(undefined)
				}}
			>
				{rows.length === 0 && (
					<div className="ptl-outline-empty">{filter ? 'No matching layers' : 'No layers yet'}</div>
				)}
				{rows.map((row) => (
					<LayerRow
						key={row.id}
						row={row}
						isSelected={selected.has(row.id)}
						isHovered={hoveredRowId === row.id}
						{...highlight.get(row.id)!}
						isRenaming={renamingId === row.id}
						dropZone={drop?.id === row.id ? drop.zone : undefined}
						onClick={(e) => onRowClick(e, row)}
						isReadonly={isReadonly}
						onDoubleClick={() => {
							if (!isReadonly) setRenamingId(row.id)
						}}
						onContextMenu={(e) => onRowContextMenu(e, row)}
						// Hover indicators only render while the pointer is over the canvas; hints always do.
						onPointerEnter={() => editor.setHintingShapes([row.id as TLShapeId])}
						onPointerLeave={() => editor.setHintingShapes([])}
						onToggleExpanded={(e) => setExpandedFor(row.id, !row.isExpanded, e.altKey)}
						onToggleLock={() => editor.toggleLock([row.id as TLShapeId])}
						onToggleHidden={() => toggleHidden(editor, [row.id as TLShapeId])}
						onRenameCommit={(value) => commitRename(row, value)}
						onRenameCancel={() => {
							setRenamingId(undefined)
							focusList()
						}}
						onDragStart={(e) => onDragStart(e, row)}
						onDragEnd={endDrag}
					/>
				))}
			</div>
		</section>
	)
}

interface LayerRowProps {
	row: OutlineRow
	isSelected: boolean
	isAncestorSelected: boolean
	isRunStart: boolean
	isRunEnd: boolean
	isHovered: boolean
	isReadonly: boolean
	isRenaming: boolean
	dropZone?: DropZone
	onClick: (e: React.MouseEvent) => void
	onDoubleClick: () => void
	onContextMenu: (e: React.MouseEvent) => void
	onPointerEnter: () => void
	onPointerLeave: () => void
	onToggleExpanded: (e: React.MouseEvent) => void
	onToggleLock: () => void
	onToggleHidden: () => void
	onRenameCommit: (value: string) => void
	onRenameCancel: () => void
	onDragStart: (e: React.DragEvent) => void
	onDragEnd: () => void
}

function LayerRow({
	row,
	isSelected,
	isAncestorSelected,
	isRunStart,
	isRunEnd,
	isHovered,
	isReadonly,
	isRenaming,
	dropZone,
	...on
}: LayerRowProps) {
	const { shape, label } = row.node
	const className = [
		'ptl-outline-row',
		isSelected && 'is-selected',
		isAncestorSelected && 'is-ancestor-selected',
		isRunStart && 'is-run-start',
		isRunEnd && 'is-run-end',
		isHovered && 'is-hovered',
		(shape.isHidden || row.isInheritedHidden) && 'is-hidden',
		shape.isLocked && 'is-locked',
		dropZone && `is-drop-${dropZone}`,
	]
		.filter(Boolean)
		.join(' ')

	return (
		<div
			className={className}
			data-shape-id={row.id}
			role="treeitem"
			aria-selected={isSelected}
			aria-expanded={row.hasChildren ? row.isExpanded : undefined}
			aria-level={row.depth + 1}
			style={{ paddingLeft: 4 + row.depth * 16 }}
			draggable={!isRenaming && !isReadonly}
			onClick={on.onClick}
			onDoubleClick={on.onDoubleClick}
			onContextMenu={on.onContextMenu}
			onPointerEnter={on.onPointerEnter}
			onPointerLeave={on.onPointerLeave}
			onDragStart={on.onDragStart}
			onDragEnd={on.onDragEnd}
		>
			{(dropZone === 'before' || dropZone === 'after') && (
				<span
					className={`ptl-outline-drop-line is-${dropZone}`}
					style={{ left: 4 + row.depth * 16 + 20 }}
				/>
			)}
			<span
				className={`ptl-outline-row__chevron ${row.isExpanded ? 'is-open' : ''}`}
				onClick={(e) => {
					e.stopPropagation()
					if (row.hasChildren) on.onToggleExpanded(e)
				}}
				onDoubleClick={(e) => e.stopPropagation()}
			>
				{row.hasChildren && <Icon.Chevron />}
			</span>
			<span className="ptl-outline-row__type">
				<ShapeTypeIcon type={shape.type} />
			</span>
			{isRenaming ? (
				<RenameInput initial={label} onCommit={on.onRenameCommit} onCancel={on.onRenameCancel} />
			) : (
				<span className="ptl-outline-row__label">{label}</span>
			)}
			<span className="ptl-outline-row__actions" hidden={isReadonly}>
				<IconButton
					title={shape.isLocked ? 'Unlock' : 'Lock'}
					isActive={shape.isLocked}
					className="ptl-outline-row__lock"
					onClick={(e) => {
						e.stopPropagation()
						on.onToggleLock()
					}}
				>
					{shape.isLocked ? <Icon.Lock /> : <Icon.Unlock />}
				</IconButton>
				<IconButton
					title={shape.isHidden ? 'Show' : 'Hide'}
					isActive={shape.isHidden}
					className="ptl-outline-row__eye"
					onClick={(e) => {
						e.stopPropagation()
						on.onToggleHidden()
					}}
				>
					{shape.isHidden ? <Icon.EyeOff /> : <Icon.Eye />}
				</IconButton>
			</span>
		</div>
	)
}
