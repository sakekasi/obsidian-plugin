import { App } from 'obsidian'
import { parseLink } from 'src/obsidian/links/link-ref'
import { ObsidianMarkdownFileTLAssetStoreProxy } from 'src/tldraw/asset-store'
import { Editor, TLShape, TLShapeId } from 'tldraw'

/**
 * Convert popover text into what goes in `meta.link`:
 * - web and obsidian:// URLs are stored as-is,
 * - vault links become a block ref line in the markdown file (so renames are tracked),
 * - links to missing files, or drawings without a markdown file, keep the raw `[[link]]`.
 */
export async function toStoredShapeLink(
	app: App,
	sourcePath: string,
	proxy: ObsidianMarkdownFileTLAssetStoreProxy | undefined,
	text: string
): Promise<string | undefined> {
	const parsed = parseLink(text)
	if (!parsed) return undefined
	if (parsed.kind !== 'vault') return parsed.url

	const raw = `[[${parsed.path}${parsed.subpath}]]`
	const file = app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath)
	if (!file || !proxy) return raw

	return proxy.addLink(file, parsed.subpath || undefined)
}

/** Set (or clear, with `null`) the link on shapes as one undoable step. */
export function setShapesLink(editor: Editor, ids: TLShapeId[], link: string | null) {
	const shapes = ids.map((id) => editor.getShape(id)).filter((shape): shape is TLShape => !!shape)
	if (shapes.length === 0) return

	editor.markHistoryStoppingPoint('edit-link')
	editor.updateShapes(shapes.map((shape) => ({ id: shape.id, type: shape.type, meta: { link } })))
}
