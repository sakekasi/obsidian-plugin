export type PageRangesResult = { ok: true; pages: number[] } | { ok: false; error: string }

/** Inclusive list of page numbers from `from` to `to`. */
export function pageRange(from: number, to: number): number[] {
	if (to < from) return []
	return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

function parsePart(part: string, pageCount: number): PageRangesResult {
	const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
	if (!match) return { ok: false, error: `"${part}" isn't a page or a range` }

	const from = Number(match[1])
	const to = match[2] === undefined ? from : Number(match[2])
	if (from > to) return { ok: false, error: `"${part}" runs backwards` }
	if (from < 1 || to > pageCount) {
		return { ok: false, error: `Pages go from 1 to ${pageCount}` }
	}

	return { ok: true, pages: pageRange(from, to) }
}

/**
 * Parse free-form page input like `1-3, 5, 8-10` into a sorted, de-duplicated list.
 */
export function parsePageRanges(text: string, pageCount: number): PageRangesResult {
	const parts = text
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
	if (parts.length === 0) return { ok: false, error: 'Enter pages, e.g. 1-3, 5' }

	const results = parts.map((part) => parsePart(part, pageCount))
	const failure = results.find((result) => !result.ok)
	if (failure) return failure

	const pages = results.flatMap((result) => (result.ok ? result.pages : []))
	return { ok: true, pages: [...new Set(pages)].sort((a, b) => a - b) }
}

/** Inverse of {@link parsePageRanges}: `[1, 2, 3, 5]` becomes `1-3, 5`. */
export function formatPageRanges(pages: number[]): string {
	const sorted = [...new Set(pages)].sort((a, b) => a - b)
	const runs = sorted.reduce<[number, number][]>((acc, page) => {
		const last = acc[acc.length - 1]
		if (last && last[1] === page - 1) {
			last[1] = page
			return acc
		}
		return [...acc, [page, page]]
	}, [])
	return runs.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(', ')
}
