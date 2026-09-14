import type { TLShapeId } from 'tldraw'
import type { LinkTargetOption } from './LinkPopover'
import type { ShapeOption } from './shape-ref'

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
	'Drawings/architecture.md',
	'Drawings/roadmap.tldr',
].map(toOption)

const shape = (id: string, pageId: string, type: string, label = '', isHidden = false): ShapeOption => ({
	id: `shape:${id}` as TLShapeId,
	pageId,
	label,
	kind: type === 'frame' && label !== '' ? 'frame' : label === '' ? 'shape' : 'text',
	type,
	isHidden,
})

/** Shapes in the drawing the popover is open in. */
export const MOCK_CURRENT_SHAPES: ShapeOption[] = [
	shape('frameIntro01', 'page:page', 'frame', 'Intro'),
	shape('titleText001', 'page:page', 'text', 'Linking shapes like Excalidraw'),
	shape('stickyIdeas1', 'page:page', 'note', 'Ideas: # opens the shape picker'),
	shape('geoBox000001', 'page:page', 'geo', 'Popover'),
	shape('geoBox000002', 'page:page', 'geo'),
	shape('hiddenDraft1', 'page:page', 'geo', 'Hidden draft', true),
	shape('arrowAbc1234', 'page:page', 'arrow'),
	shape('frameDetail1', 'page:details', 'frame', 'Details (page 2)'),
	shape('detailText01', 'page:details', 'text', 'Zoom to fit + select on navigate'),
	shape('drawStroke01', 'page:details', 'draw'),
]

/** Shapes in other drawings, keyed by the link path typed before `#`. */
export const MOCK_DRAWING_SHAPES: Record<string, ShapeOption[]> = {
	'Drawings/architecture': [
		shape('archFrame001', 'page:page', 'frame', 'Plugin'),
		shape('archFrame002', 'page:page', 'frame', 'tldraw editor'),
		shape('archStore001', 'page:page', 'geo', 'Asset store'),
		shape('archArrow001', 'page:page', 'arrow'),
	],
	'Drawings/roadmap.tldr': [
		shape('roadQ3000001', 'page:page', 'note', 'Q3: shape links'),
		shape('roadQ4000001', 'page:page', 'note', 'Q4: backlinks panel'),
	],
}
