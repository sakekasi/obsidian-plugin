import { App, HoverParent, Notice, TFile } from 'obsidian'
import { exitFullscreen } from 'src/obsidian/fullscreen'
import { ObsidianMarkdownFileTLAssetStoreProxy } from 'src/tldraw/asset-store'
import { VIEW_TYPE_TLDRAW } from 'src/utils/constants'
import { parseLink } from './link-ref'

export type ResolvedShapeLink =
	| { kind: 'external'; url: string }
	| { kind: 'vault'; file: TFile; subpath: string; linktext: string }
	| { kind: 'unresolved'; linktext: string }

/**
 * Resolve a shape's `meta.link`. Vault links are normally stored as `obsidian.blockref.<id>`
 * (pointing at a link line in the markdown body), but raw `[[links]]` are accepted too.
 */
export function resolveShapeLink(
	app: App,
	sourcePath: string,
	proxy: ObsidianMarkdownFileTLAssetStoreProxy | undefined,
	link: string
): ResolvedShapeLink | undefined {
	if (ObsidianMarkdownFileTLAssetStoreProxy.isBlockRefId(link)) {
		const resolved = proxy?.resolveBlockRef(link)
		if (!resolved) return undefined
		const { file, subpath } = resolved
		return { kind: 'vault', file, subpath, linktext: `${file.path}${subpath}` }
	}

	const parsed = parseLink(link)
	if (!parsed) return undefined
	if (parsed.kind !== 'vault') return { kind: 'external', url: parsed.url }

	const file = app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath)
	if (!file) return { kind: 'unresolved', linktext: `${parsed.path}${parsed.subpath}` }
	return { kind: 'vault', file, subpath: parsed.subpath, linktext: `${file.path}${parsed.subpath}` }
}

/** Text shown when editing a link: `[[path#subpath]]` for vault links, the URL otherwise. */
export function toEditableLinkText(resolved: ResolvedShapeLink | undefined, sourcePath?: string) {
	if (!resolved) return ''
	if (resolved.kind === 'external') return resolved.url
	// Links to shapes in the same drawing are shown as just `#^id`.
	if (resolved.kind === 'vault' && resolved.file.path === sourcePath && resolved.subpath !== '') {
		return `[[${resolved.subpath}]]`
	}
	const path = resolved.kind === 'vault' && resolved.file.extension === 'md'
		? resolved.linktext.replace(/\.md(?=#|$)/, '')
		: resolved.linktext
	return `[[${path}]]`
}

export async function openShapeLink(app: App, resolved: ResolvedShapeLink, newTab: boolean) {
	switch (resolved.kind) {
		case 'external':
			window.open(resolved.url, '_blank')
			return
		case 'unresolved':
			new Notice(`Can't find "${resolved.linktext}" in this vault.`)
			return
		case 'vault':
			// A new tab would open behind fullscreen (which hides every other tab), so leave it first.
			if (newTab) exitFullscreen(activeDocument)
			await app.workspace
				.getLeaf(newTab ? 'tab' : false)
				.openFile(resolved.file, { active: true, eState: { subpath: resolved.subpath } })
	}
}

/** Show Obsidian's page preview for a vault link (requires the Page preview core plugin). */
export function hoverShapeLink(
	app: App,
	resolved: ResolvedShapeLink,
	event: MouseEvent,
	hoverParent: HoverParent,
	targetEl: HTMLElement
) {
	if (resolved.kind !== 'vault') return
	app.workspace.trigger('hover-link', {
		event,
		source: VIEW_TYPE_TLDRAW,
		hoverParent,
		targetEl,
		linktext: resolved.linktext,
		sourcePath: '',
	})
}
