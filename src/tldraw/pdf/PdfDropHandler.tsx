import { TFile } from 'obsidian'
import { ComponentType, useEffect } from 'react'
import TldrawPlugin from 'src/main'
import { TLExternalContent, useEditor } from 'tldraw'
import { copyPdfIntoVault, importPdfIntoEditor } from './import-pdf'

type FilesContent = Extract<TLExternalContent<unknown>, { type: 'files' }>
type FilesHandler = (info: FilesContent) => Promise<void>

// Obsidian's drag manager describes drags that start in the file explorer. Not public API.
interface ObsidianDraggable {
	type?: string
	file?: TFile
	files?: TFile[]
}

function isPdfFile(file: File) {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function draggedVaultFiles(plugin: TldrawPlugin): TFile[] {
	const draggable = (plugin.app as unknown as { dragManager?: { draggable?: ObsidianDraggable | null } })
		.dragManager?.draggable
	if (!draggable) return []
	if (draggable.type === 'file' && draggable.file) return [draggable.file]
	if (draggable.type === 'files') return draggable.files ?? []
	return []
}

function runInOrder<T>(items: T[], run: (item: T) => Promise<unknown>) {
	return items.reduce<Promise<unknown>>((chain, item) => chain.then(() => run(item)), Promise.resolve())
}

/**
 * Dropping a PDF, from the file explorer or from outside Obsidian, opens the import modal
 * instead of adding the file itself. Other files keep tldraw's usual handling.
 */
export function createPdfDropHandler(plugin: TldrawPlugin, sourcePath: string): ComponentType {
	return function PdfDropHandler() {
		const editor = useEditor()

		useEffect(() => {
			// `externalContentHandlers` is internal to tldraw, but lets us defer to the default.
			const handlers = (editor as unknown as { externalContentHandlers: Record<string, FilesHandler | null | undefined> })
				.externalContentHandlers
			const previous = handlers.files

			editor.registerExternalContentHandler('files', async (info) => {
				const pdfs = info.files.filter(isPdfFile)
				const others = info.files.filter((file) => !isPdfFile(file))

				if (others.length > 0) await previous?.({ ...info, files: others })
				if (pdfs.length === 0 || editor.getIsReadonly()) return

				const point = info.point ?? editor.getViewportPageBounds().center
				await runInOrder(pdfs, async (pdf) => {
					const file = await copyPdfIntoVault(plugin, pdf, sourcePath)
					await importPdfIntoEditor({ plugin, editor, file, point })
				})
			})

			// Drags from the file explorer carry no File objects, so catch them before tldraw
			// or Obsidian treat the drop as text.
			const container = editor.getContainer()
			const onDrop = (evt: DragEvent) => {
				const pdfs = draggedVaultFiles(plugin).filter((file) => file.extension === 'pdf')
				if (pdfs.length === 0 || editor.getIsReadonly()) return

				evt.preventDefault()
				evt.stopPropagation()
				const point = editor.screenToPage({ x: evt.clientX, y: evt.clientY })
				void runInOrder(pdfs, (file) => importPdfIntoEditor({ plugin, editor, file, point }))
			}
			container.addEventListener('drop', onDrop, true)

			return () => {
				container.removeEventListener('drop', onDrop, true)
				editor.registerExternalContentHandler('files', previous ?? null)
			}
		}, [editor])

		return null
	}
}
