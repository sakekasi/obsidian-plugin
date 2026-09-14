import { App } from 'obsidian'
import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadPdfSource } from '../../../gallery/pdfjs-source'
import { GallerySection } from '../../../gallery/registry'
import { makeSamplePdf } from '../pdf/fixtures'
import { PdfImportModal, PdfImportModalState, PdfImportOptions } from './PdfImportModal'
import 'src/styles/pdf-import-modal.css'

export const title = 'PDF Import Modal'

const galleryApp = {} as App

function useLog() {
	const [entries, setEntries] = useState<string[]>([])
	const log = (entry: string) => setEntries((prev) => [entry, ...prev].slice(0, 20))
	return [entries, log] as const
}

function ModalStory({
	pdf,
	fileName,
	initialState,
	overlay = false,
}: {
	pdf: Uint8Array
	fileName: string
	initialState?: Partial<PdfImportModalState>
	overlay?: boolean
}) {
	const hostRef = useRef<HTMLDivElement>(null)
	const [entries, log] = useLog()
	const [generation, setGeneration] = useState(0)
	const [open, setOpen] = useState<(() => void) | null>(null)

	useEffect(() => {
		const host = hostRef.current
		if (!host) return

		let modal: PdfImportModal | undefined
		let disposed = false
		const sourcePromise = loadPdfSource(pdf)

		const onSubmit = (options: PdfImportOptions) =>
			log(`import pages=[${options.pages.join(', ')}] scale=${options.scale}`)

		void sourcePromise.then((source) => {
			if (disposed) return
			const create = () => new PdfImportModal(galleryApp, fileName, source, onSubmit, initialState)
			if (overlay) {
				setOpen(() => () => {
					modal = create()
					modal.setCloseCallback(() => log('closed'))
					modal.open()
				})
				return
			}
			modal = create()
			modal.setCloseCallback(() => log('closed'))
			;(modal as PdfImportModal & { openInline(parent: HTMLElement): void }).openInline(host)
		})

		return () => {
			disposed = true
			modal?.close()
			void sourcePromise.then((source) => source.destroy())
		}
	}, [pdf, fileName, initialState, overlay, generation])

	return (
		<div>
			<div className="gallery-row" style={{ marginBottom: 8 }}>
				{overlay && (
					<button disabled={!open} onClick={() => open?.()}>
						Open modal
					</button>
				)}
				<button onClick={() => setGeneration((g) => g + 1)}>Reset</button>
			</div>
			<div ref={hostRef} />
			<div className="gallery-log">
				{entries.length === 0 ? 'Events appear here' : entries.map((e, i) => <div key={i}>{e}</div>)}
			</div>
		</div>
	)
}

function OwnPdfStory() {
	const [file, setFile] = useState<{ name: string; data: Uint8Array } | null>(null)

	return (
		<div>
			<input
				type="file"
				accept="application/pdf"
				onChange={async (evt) => {
					const picked = evt.target.files?.[0]
					if (!picked) return
					setFile({ name: picked.name, data: new Uint8Array(await picked.arrayBuffer()) })
				}}
			/>
			{file && <ModalStory key={file.name} pdf={file.data} fileName={file.name} />}
		</div>
	)
}

const SELECTION_STATE: Partial<PdfImportModalState> = { mode: 'selection', selected: [1, 3, 4, 9] }
const INVALID_STATE: Partial<PdfImportModalState> = { mode: 'custom', custom: '1-3, 20' }

export default function PdfImportModalGallery() {
	const thirteenPages = useMemo(() => makeSamplePdf(13), [])
	const onePage = useMemo(() => makeSamplePdf(1), [])

	return (
		<>
			<GallerySection
				title="13 pages"
				description="Default state: all pages selected at 30%. Click thumbnails to switch to Selection."
			>
				<ModalStory pdf={thirteenPages} fileName="Attachments/lecture-notes.pdf" />
			</GallerySection>
			<GallerySection title="Selection from thumbnails">
				<ModalStory pdf={thirteenPages} fileName="lecture-notes.pdf" initialState={SELECTION_STATE} />
			</GallerySection>
			<GallerySection title="Invalid custom range">
				<ModalStory pdf={thirteenPages} fileName="lecture-notes.pdf" initialState={INVALID_STATE} />
			</GallerySection>
			<GallerySection title="Single page">
				<ModalStory pdf={onePage} fileName="receipt.pdf" />
			</GallerySection>
			<GallerySection title="As overlay" description="Opened the way Obsidian shows it, over a dimmed backdrop.">
				<ModalStory pdf={thirteenPages} fileName="lecture-notes.pdf" overlay />
			</GallerySection>
			<GallerySection title="Your own PDF">
				<OwnPdfStory />
			</GallerySection>
		</>
	)
}
