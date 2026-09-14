import { atom, Atom, Editor } from 'tldraw'

const openStates = new WeakMap<Editor, Atom<boolean>>()

/** Whether the link popover is open for this editor. */
export function linkEditorOpen(editor: Editor): Atom<boolean> {
	const existing = openStates.get(editor)
	if (existing) return existing

	const created = atom('link editor open', false)
	openStates.set(editor, created)
	return created
}
