import * as React from 'react'
import { useState } from 'react'
import { GallerySection } from '../../../gallery/registry'
import { MOCK_VAULT_FILES } from './fixtures'
import { LinkPopover } from './LinkPopover'
import 'src/styles/link-popover.css'

export const title = 'Link Popover'

function PopoverStory({ initialLink }: { initialLink?: string }) {
	const [log, setLog] = useState<string[]>([])
	const [generation, setGeneration] = useState(0)
	const push = (entry: string) => setLog((prev) => [entry, ...prev].slice(0, 10))

	return (
		<div>
			<div className="gallery-row">
				<LinkPopover
					key={generation}
					files={MOCK_VAULT_FILES}
					initialLink={initialLink}
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
