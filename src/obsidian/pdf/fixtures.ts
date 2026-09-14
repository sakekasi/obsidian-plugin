// Generates small, valid PDFs for gallery stories and tests, so no real documents
// need to be checked in. Pages look vaguely like a document: a title, text bars, and
// an occasional coloured "figure". Every third page is landscape to exercise aspect ratios.

const LETTER = { width: 612, height: 792 }

function pageContent(page: number, width: number, height: number) {
	const margin = 64
	const barWidth = width - margin * 2
	const titleY = height - 96
	const bars = Array.from({ length: Math.floor((height - 220) / 22) }, (_, i) => {
		const y = titleY - 48 - i * 22
		// Vary line lengths so it reads as paragraphs.
		const w = (i + page) % 5 === 4 ? barWidth * 0.55 : barWidth
		return `${margin} ${y} ${w.toFixed(1)} 9 re f`
	})
	const figure =
		page % 2 === 0
			? [`0.54 0.36 0.96 rg ${margin} ${titleY - 48 - 7 * 22} ${barWidth} 120 re f`]
			: []

	return [
		'0.12 g',
		'BT /F1 28 Tf',
		`${margin} ${titleY} Td`,
		`(Sample page ${page}) Tj`,
		'ET',
		'0.85 g',
		...bars,
		...figure,
	].join('\n')
}

export function makeSamplePdf(pageCount: number): Uint8Array {
	const pages = Array.from({ length: pageCount }, (_, i) => {
		const landscape = (i + 1) % 3 === 0
		const width = landscape ? LETTER.height : LETTER.width
		const height = landscape ? LETTER.width : LETTER.height
		return { page: i + 1, width, height }
	})

	// Object ids: 1 catalog, 2 page tree, 3 font, then (page, content) pairs.
	const pageObjectId = (index: number) => 4 + index * 2
	const kids = pages.map((_, i) => `${pageObjectId(i)} 0 R`).join(' ')

	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		...pages.flatMap(({ page, width, height }, i) => {
			const stream = pageContent(page, width, height)
			return [
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObjectId(i) + 1} 0 R >>`,
				`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
			]
		}),
	]

	const header = '%PDF-1.4\n'
	const { body, offsets } = objects.reduce(
		(acc, object, i) => {
			const chunk = `${i + 1} 0 obj\n${object}\nendobj\n`
			return { body: acc.body + chunk, offsets: [...acc.offsets, header.length + acc.body.length] }
		},
		{ body: '', offsets: [] as number[] }
	)

	const xrefOffset = header.length + body.length
	const xref = [
		'xref',
		`0 ${objects.length + 1}`,
		'0000000000 65535 f ',
		...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
	].join('\n')
	const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

	return new TextEncoder().encode(`${header}${body}${xref}\n${trailer}`)
}
