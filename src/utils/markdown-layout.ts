// Layout of a tldraw markdown file:
//
//   ---frontmatter---
//   (anything the user wrote)
//   # tldraw Data
//   ## Links
//   [[target]]
//   ^<uuid>
//   ## Drawing
//   ```json !!!_START_OF_TLDRAW_DATA…
//
// Kept free of `obsidian` imports so it can be tested in isolation.

import { TLDATA_DELIMITER_END, TLDATA_DELIMITER_START } from './constants'

export const DATA_HEADING = '# tldraw Data'
export const LINKS_HEADING = '## Links'
export const DRAWING_HEADING = '## Drawing'

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/
// A link line followed by a block id line. Only uuid block ids are ours; users' own
// `^block` ids elsewhere are never touched.
const LINK_BLOCK_PATTERN =
	/^([^\n]*\S[^\n]*)\r?\n\^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[ \t]*$/gm
const BLOCK_REF_ID_PATTERN = /obsidian\.blockref\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g

export interface LinkBlock {
	id: string
	/** The link line, e.g. `[[meeting-notes]]`. */
	link: string
}

export function linkBlockText({ link, id }: LinkBlock) {
	return `${link}\n^${id}`
}

/** Block ids referenced anywhere in the given records (shape meta, asset srcs, …). */
export function collectBlockRefIds(records: unknown[]): Set<string> {
	const json = JSON.stringify(records)
	return new Set([...json.matchAll(BLOCK_REF_ID_PATTERN)].map((match) => match[1]))
}

function splitFrontmatter(text: string) {
	const match = FRONTMATTER_PATTERN.exec(text)
	if (!match) return { frontmatter: '', body: text }
	return { frontmatter: match[0].endsWith('\n') ? match[0] : `${match[0]}\n`, body: text.slice(match[0].length) }
}

/** Split the body around the drawing's code block, or undefined when there isn't one. */
function splitCodeBlock(body: string) {
	const startMarker = body.indexOf(TLDATA_DELIMITER_START)
	const endMarker = body.indexOf(TLDATA_DELIMITER_END, startMarker)
	if (startMarker === -1 || endMarker === -1) return undefined

	const blockStart = body.lastIndexOf('\n', startMarker) + 1
	const fence = body.indexOf('```', endMarker)
	const blockEnd = fence === -1 ? endMarker + TLDATA_DELIMITER_END.length : fence + 3

	return {
		before: body.slice(0, blockStart),
		codeblock: body.slice(blockStart, blockEnd),
		after: body.slice(blockEnd),
	}
}

function extractLinkBlocks(text: string): { blocks: LinkBlock[]; rest: string } {
	const blocks = [...text.matchAll(LINK_BLOCK_PATTERN)].map((match) => ({ link: match[1], id: match[2] }))
	return { blocks, rest: text.replace(LINK_BLOCK_PATTERN, '') }
}

function removeHeadings(text: string) {
	return [DATA_HEADING, LINKS_HEADING, DRAWING_HEADING].reduce(
		(acc, heading) => acc.replace(new RegExp(`^${heading}[ \\t]*$`, 'gm'), ''),
		text
	)
}

export function layoutTldrawMarkdown({
	frontmatter,
	notes = '',
	blocks,
	codeblock,
	after = '',
}: {
	frontmatter: string
	notes?: string
	blocks: LinkBlock[]
	codeblock: string
	after?: string
}) {
	const trimmedNotes = notes.replace(/\n{3,}/g, '\n\n').trim()
	const links = blocks.map(linkBlockText).join('\n\n')
	return [
		frontmatter,
		trimmedNotes ? `${trimmedNotes}\n\n` : '',
		`${DATA_HEADING}\n\n`,
		`${LINKS_HEADING}\n\n`,
		links ? `${links}\n\n` : '',
		`${DRAWING_HEADING}\n\n`,
		codeblock,
		after.trim() ? `\n\n${after.trim()}\n` : '\n',
	].join('')
}

/**
 * Rewrite a drawing file into the sectioned layout with a fresh code block, dropping link
 * blocks that `keep` rejects. Files without a code block get one appended.
 */
export function rebuildTldrawMarkdown(data: string, codeblock: string, keep: (id: string) => boolean) {
	const { frontmatter, body } = splitFrontmatter(data)
	const split = splitCodeBlock(body)
	const before = split?.before ?? body
	const after = split?.after ?? ''

	// Link blocks live under our headings, or directly after the frontmatter in older files.
	const dataHeadingIndex = before.search(new RegExp(`^${DATA_HEADING}[ \\t]*$`, 'm'))
	const notes = dataHeadingIndex === -1 ? '' : before.slice(0, dataHeadingIndex)
	const section = dataHeadingIndex === -1 ? before : before.slice(dataHeadingIndex)

	const { blocks, rest } = extractLinkBlocks(section)
	const leftover = removeHeadings(rest).trim()
	const uniqueBlocks = [...new Map(blocks.map((block) => [block.id, block])).values()]

	return layoutTldrawMarkdown({
		frontmatter,
		notes: [notes, leftover].filter((part) => part.trim()).join('\n\n'),
		blocks: uniqueBlocks.filter((block) => keep(block.id)),
		codeblock,
		after,
	})
}

/**
 * Remove link blocks by id, matching on the text itself rather than cached offsets, which
 * go stale whenever the file is rewritten.
 */
export function removeLinkBlocks(data: string, ids: string[]): { text: string; removed: LinkBlock[] } {
	const targets = new Set(ids)
	const removed: LinkBlock[] = []
	const text = data.replace(LINK_BLOCK_PATTERN, (match, link: string, id: string) => {
		if (!targets.has(id)) return match
		removed.push({ link, id })
		return ''
	})
	return { text: text.replace(/\n{3,}/g, '\n\n'), removed }
}

/** Insert a link block under the Links heading, or after the frontmatter for older files. */
export function insertLinkBlock(data: string, block: LinkBlock) {
	const text = linkBlockText(block)
	const heading = new RegExp(`^${LINKS_HEADING}[ \\t]*\\r?\\n`, 'm').exec(data)
	if (heading) {
		const at = heading.index + heading[0].length
		return `${data.slice(0, at)}\n${text}\n${data.slice(at)}`
	}

	const { frontmatter, body } = splitFrontmatter(data)
	return `${frontmatter}\n${text}\n${body}`
}
