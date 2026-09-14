import { Notice, TFile } from 'obsidian'
import TldrawPlugin from 'src/main'
import { PdfImportModal, PdfImportOptions } from 'src/obsidian/modal/PdfImportModal'
import { openPdfDocument } from 'src/obsidian/pdf/pdf-services'
import { toPdfPageSource } from 'src/obsidian/pdf/render'
import { createAttachmentFilepath } from 'src/utils/utils'
import { Editor, VecLike } from 'tldraw'
import { insertPdfPages } from './insert-pages'
import { getEditorAssetProxy } from './pdf-assets'

/** Ask which pages to import from a vault PDF, then add them to the canvas. */
export async function importPdfIntoEditor({
	plugin,
	editor,
	file,
	point,
}: {
	plugin: TldrawPlugin
	editor: Editor
	file: TFile
	point?: VecLike
}) {
	const proxy = getEditorAssetProxy(editor)
	if (!proxy) {
		new Notice('PDF pages can only be added to drawings stored in markdown.')
		return
	}

	try {
		const document = await openPdfDocument(plugin.app, file)
		const options = await new Promise<PdfImportOptions | undefined>((resolve) => {
			const modal = new PdfImportModal(plugin.app, file.path, toPdfPageSource(document), resolve)
			// Also runs after Import, when the promise has already resolved.
			modal.setCloseCallback(() => resolve(undefined))
			modal.open()
		})
		if (!options) return

		await insertPdfPages(
			editor,
			plugin.app,
			proxy,
			file,
			options,
			point ?? editor.getViewportPageBounds().center
		)
	} catch (error) {
		console.error('Unable to import PDF', error)
		new Notice(`Unable to import ${file.name}. See the developer console for details.`)
	}
}

/** Copy a PDF dropped from outside Obsidian into the attachments folder for this drawing. */
export async function copyPdfIntoVault(plugin: TldrawPlugin, pdf: File, sourcePath: string) {
	const { app } = plugin
	const attachTo = app.vault.getFileByPath(sourcePath) ?? undefined
	const { filename, folder } = await createAttachmentFilepath(app.fileManager, pdf.name, attachTo)
	const path = folder === '/' ? filename : `${folder}/${filename}`
	return app.vault.createBinary(path, await pdf.arrayBuffer())
}
