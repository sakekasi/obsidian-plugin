// Parsing for the links that can be attached to shapes. Kept free of `obsidian` imports
// so it can be used from the gallery and tests.

/** A PDF region in PDF user-space units: left, bottom, right, top. */
export type PdfRect = [number, number, number, number]

export type ParsedLink =
	| { kind: 'url'; url: string }
	| { kind: 'obsidian-url'; url: string }
	| {
			kind: 'vault'
			/** Link path without subpath, e.g. `Attachments/lecture.pdf`. */
			path: string
			/** Subpath including the leading `#`, or '' when absent. */
			subpath: string
			alias?: string
			page?: number
			rect?: PdfRect
	  }

const URL_PATTERN = /^\w+:\/\//
const WIKILINK_PATTERN = /^!?\[\[([^\]]*)\]\]$/
const MARKDOWN_LINK_PATTERN = /^!?\[[^\]]*\]\(<?([^)>]*)>?\)$/

export function isWebUrl(text: string) {
	return URL_PATTERN.test(text.trim()) && !text.trim().startsWith('obsidian://')
}

function parsePdfSubpath(subpath: string): { page?: number; rect?: PdfRect } {
	const params = new URLSearchParams(subpath.replace(/^#/, ''))
	const page = Number(params.get('page'))
	const rect = params
		.get('rect')
		?.split(',')
		.map(Number)
	return {
		page: Number.isInteger(page) && page > 0 ? page : undefined,
		rect: rect?.length === 4 && rect.every(Number.isFinite) ? (rect as PdfRect) : undefined,
	}
}

/**
 * Parse a stored link: `[[path#sub|alias]]`, `[alias](path#sub)`, a bare `path#sub`,
 * a web URL, or an `obsidian://` URL.
 */
export function parseLink(text: string): ParsedLink | undefined {
	const trimmed = text.trim()
	if (trimmed === '') return undefined
	if (trimmed.startsWith('obsidian://')) return { kind: 'obsidian-url', url: trimmed }
	if (URL_PATTERN.test(trimmed)) return { kind: 'url', url: trimmed }

	const wikilink = WIKILINK_PATTERN.exec(trimmed)
	const markdown = wikilink ? undefined : MARKDOWN_LINK_PATTERN.exec(trimmed)
	const inner = wikilink?.[1] ?? (markdown ? decodeURI(markdown[1]) : trimmed)

	const [target, alias] = inner.split('|', 2)
	const hash = target.indexOf('#')
	const path = (hash === -1 ? target : target.slice(0, hash)).trim()
	const subpath = hash === -1 ? '' : target.slice(hash)

	return {
		kind: 'vault',
		path,
		subpath,
		...(alias ? { alias } : {}),
		...parsePdfSubpath(subpath),
	}
}

export function formatPdfSubpath(page: number, rect?: PdfRect) {
	const round = (n: number) => Math.round(n * 100) / 100
	return rect ? `#page=${page}&rect=${rect.map(round).join(',')}` : `#page=${page}`
}

export function formatPdfLink(path: string, page: number, rect?: PdfRect) {
	return `[[${path}${formatPdfSubpath(page, rect)}]]`
}
