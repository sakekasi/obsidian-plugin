import type { LinkTargetOption } from './LinkPopover'

const toOption = (path: string): LinkTargetOption => {
	const name = path.split('/').pop() ?? path
	const dot = name.lastIndexOf('.')
	return {
		path,
		basename: dot === -1 ? name : name.slice(0, dot),
		extension: dot === -1 ? '' : name.slice(dot + 1),
	}
}

export const MOCK_VAULT_FILES: LinkTargetOption[] = [
	'Inbox.md',
	'meeting-notes.md',
	'meeting-notes-2026.md',
	'meetings/q3-planning.md',
	'meetings/q3-budget.pdf',
	'Projects/tldraw plugin/design.md',
	'Projects/tldraw plugin/links and pdfs.md',
	'Projects/thesis/chapter-1.md',
	'Projects/thesis/related-work.md',
	'Attachments/lecture-notes.pdf',
	'Attachments/whiteboard-photo.png',
	'Reading/Designing Data-Intensive Applications.pdf',
	'Reading/notes on context engineering.md',
	'Daily/2026-09-12.md',
	'Daily/2026-09-13.md',
].map(toOption)
