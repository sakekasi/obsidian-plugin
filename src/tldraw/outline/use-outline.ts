import { useCallback, useMemo } from 'react'
import { Editor, TLShape, useValue } from 'tldraw'
import { OutlineShape } from './tree-model'
import { isShapeFlaggedHidden } from './visibility'

function shapeText(editor: Editor, shape: TLShape) {
	if (shape.type === 'frame') return (shape.props as { name?: string }).name
	return editor.getShapeUtil(shape).getText(shape)
}

export function toOutlineShape(editor: Editor, shape: TLShape): OutlineShape {
	return {
		id: shape.id,
		type: shape.type,
		parentId: shape.parentId,
		index: shape.index,
		name: typeof shape.meta.name === 'string' ? shape.meta.name : undefined,
		text: shapeText(editor, shape),
		isLocked: shape.isLocked,
		isHidden: isShapeFlaggedHidden(shape),
	}
}

/**
 * The current page's shapes, reduced to what the outline shows. The value is serialised so
 * moving or resizing shapes on the canvas (which doesn't change the outline) never re-renders.
 */
export function useOutlineShapes(editor: Editor) {
	const key = useValue(
		'outline shapes',
		() =>
			JSON.stringify({
				pageId: editor.getCurrentPageId(),
				shapes: editor.getCurrentPageShapes().map((s) => toOutlineShape(editor, s)),
			}),
		[editor]
	)
	return useMemo(() => JSON.parse(key) as { pageId: string; shapes: OutlineShape[] }, [key])
}

export interface OutlinePanelState {
	collapsed: boolean
	width: number
}

const DEFAULT_PANEL_STATE: OutlinePanelState = { collapsed: true, width: 260 }

/** Panel state lives in the tldraw document meta, so it is saved per file. */
export function useOutlinePanelState(editor: Editor) {
	const stored = useValue(
		'outline panel state',
		() => editor.getDocumentSettings().meta.outlinePanel as Partial<OutlinePanelState> | undefined,
		[editor]
	)
	const state: OutlinePanelState = { ...DEFAULT_PANEL_STATE, ...stored }

	const update = useCallback(
		(patch: Partial<OutlinePanelState>) => {
			const meta = editor.getDocumentSettings().meta
			const current = meta.outlinePanel as Partial<OutlinePanelState> | undefined
			editor.run(
				() =>
					editor.updateDocumentSettings({
						meta: { ...meta, outlinePanel: { ...DEFAULT_PANEL_STATE, ...current, ...patch } },
					}),
				{ history: 'ignore' }
			)
		},
		[editor]
	)

	return [state, update] as const
}
