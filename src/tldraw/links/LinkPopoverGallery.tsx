import * as React from 'react'
import { useCallback, useState } from 'react'
import { GallerySection } from '../../../gallery/registry'
import { MOCK_CURRENT_SHAPES, MOCK_DRAWING_SHAPES, MOCK_VAULT_FILES } from './fixtures'
import { LinkPopover } from './LinkPopover'
import { ShapeOption, shapeOptionTitle } from './shape-ref'
import 'src/styles/link-popover.css'

export const title = 'Link Popover'

const getMockShapeOptions = (path: string): ShapeOption[] | Promise<ShapeOption[]> => {
	if (path === '') return MOCK_CURRENT_SHAPES
	// Other drawings are read from disk, so fake a short delay to show the loading state.
	return new Promise((resolve) => setTimeout(() => resolve(MOCK_DRAWING_SHAPES[path] ?? []), 300))
}

function PopoverStory({ initialLink }: { initialLink?: string }) {
	const [log, setLog] = useState<string[]>([])
	const [generation, setGeneration] = useState(0)
	const push = useCallback((entry: string) => setLog((prev) => [entry, ...prev].slice(0, 10)), [])
	const onPreviewShape = useCallback(
		(option: ShapeOption) => push(`preview ${shapeOptionTitle(option)} (${option.pageId})`),
		[push]
	)

	return (
		<div>
			<div className="gallery-row">
				<LinkPopover
					key={generation}
					files={MOCK_VAULT_FILES}
					initialLink={initialLink}
					getShapeOptions={getMockShapeOptions}
					onPreviewShape={onPreviewShape}
					onPreviewEnd={() => push('preview end (camera restored)')}
					onSave={(link) => push(`save ${link}`)}
					onRemove={() => push('remove')}
					onCancel={() => push('cancel')}
				/>
				<button onClick={() => setGeneration((g) => g + 1)}>Reset</button>
			</div>
			<div className="gallery-log">{log.length === 0 ? 'Events appear here' : log.map((e, i) => <div key={i}>{e}</div>)}</div>
		</div>
	)
}

export default function LinkPopoverGallery() {
	return (
		<>
			<GallerySection
				title="New link"
				description="Type to fuzzy-search the vault. ↑/↓ to move, Enter to pick a file (then add #heading or #page=3), Enter again to save, Esc to cancel."
			>
				<PopoverStory />
			</GallerySection>
			<GallerySection
				title="Link to a shape in this drawing"
				description="Type # to list shapes in the current drawing, then keep typing to filter by text or frame name. Highlighting a shape previews it (see the log)."
			>
				<PopoverStory initialLink="#" />
			</GallerySection>
			<GallerySection
				title="Link to a shape in another drawing"
				description="Pick Drawings/architecture or Drawings/roadmap.tldr, then type #. Shapes load after a short delay."
			>
				<PopoverStory initialLink="[[Drawings/architecture#]]" />
			</GallerySection>
			<GallerySection title="Editing an existing shape link">
				<PopoverStory initialLink="[[#^geoBox000001]]" />
			</GallerySection>
			<GallerySection
				title="Non-drawing file with #"
				description="Typing # after a markdown note lists no shapes, so #heading can still be typed and saved."
			>
				<PopoverStory initialLink="[[meeting-notes#Agenda]]" />
			</GallerySection>
			<GallerySection title="Editing an existing link">
				<PopoverStory initialLink="[[Projects/tldraw plugin/design#importing a PDF]]" />
			</GallerySection>
			<GallerySection title="PDF page link">
				<PopoverStory initialLink="[[Attachments/lecture-notes.pdf#page=3]]" />
			</GallerySection>
			<GallerySection title="Web URL">
				<PopoverStory initialLink="https://tldraw.dev" />
			</GallerySection>
		</>
	)
}
