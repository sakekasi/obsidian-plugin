import { Editor, TLShape, TLShapeId } from 'tldraw'

/**
 * Shapes hidden from the outline panel carry `meta.hidden`. tldraw propagates 'hidden' to
 * descendants when children return 'inherit', so only the flagged shape needs checking.
 */
export function getShapeVisibility(shape: TLShape): 'hidden' | 'inherit' {
	return shape.meta.hidden === true ? 'hidden' : 'inherit'
}

export function isShapeFlaggedHidden(shape: TLShape) {
	return shape.meta.hidden === true
}

/** Toggles hidden on all ids together: if any are visible, hide them all; otherwise show all. */
export function toggleHidden(editor: Editor, ids: TLShapeId[]) {
	const shapes = ids.map((id) => editor.getShape(id)).filter((s): s is TLShape => !!s)
	if (!shapes.length) return
	const hide = shapes.some((s) => !isShapeFlaggedHidden(s))
	editor.markHistoryStoppingPoint('outline toggle hidden')
	editor.updateShapes(
		shapes.map((s) => ({
			id: s.id,
			type: s.type,
			meta: { ...s.meta, hidden: hide },
		}))
	)
	if (hide) editor.deselect(...shapes.map((s) => s.id))
}

export function renameShape(editor: Editor, id: TLShapeId, name: string) {
	const shape = editor.getShape(id)
	if (!shape) return
	const trimmed = name.trim()
	const { name: _old, ...rest } = shape.meta

	// Frames already have a title on the canvas, so renaming edits that instead of meta.name.
	if (shape.type === 'frame') {
		if (shape.props.name === trimmed && _old === undefined) return
		editor.markHistoryStoppingPoint('outline rename')
		editor.updateShape({ id, type: 'frame', props: { name: trimmed }, meta: rest })
		return
	}

	if ((shape.meta.name ?? '') === trimmed) return
	editor.markHistoryStoppingPoint('outline rename')
	editor.updateShape({
		id,
		type: shape.type,
		meta: trimmed ? { ...rest, name: trimmed } : rest,
	})
}
