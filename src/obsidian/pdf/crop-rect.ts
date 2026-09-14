import type { PdfRect } from 'src/obsidian/links/link-ref'

/** The parts of a pdf.js viewport needed to convert between image and PDF coordinates. */
export interface ViewportLike {
	width: number
	height: number
	convertToPdfPoint(x: number, y: number): [number, number]
	convertToViewportPoint(x: number, y: number): [number, number]
}

/** tldraw's crop: fractions (0-1) of the full image. */
export interface NormalizedCrop {
	topLeft: { x: number; y: number }
	bottomRight: { x: number; y: number }
}

const EPSILON = 1e-3

export function isFullCrop(crop: NormalizedCrop | null | undefined) {
	if (!crop) return true
	return (
		crop.topLeft.x < EPSILON &&
		crop.topLeft.y < EPSILON &&
		crop.bottomRight.x > 1 - EPSILON &&
		crop.bottomRight.y > 1 - EPSILON
	)
}

/**
 * Convert a crop of a full-page render into a PDF user-space rect (left, bottom, right, top).
 * The viewport (at any scale) handles the page's rotation, so this works for 0/90/180/270.
 */
export function cropToPdfRect(crop: NormalizedCrop, viewport: ViewportLike): PdfRect {
	const [x1, y1] = viewport.convertToPdfPoint(crop.topLeft.x * viewport.width, crop.topLeft.y * viewport.height)
	const [x2, y2] = viewport.convertToPdfPoint(
		crop.bottomRight.x * viewport.width,
		crop.bottomRight.y * viewport.height
	)
	return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]
}

export function pdfRectToCrop(rect: PdfRect, viewport: ViewportLike): NormalizedCrop {
	const [ax, ay] = viewport.convertToViewportPoint(rect[0], rect[1])
	const [bx, by] = viewport.convertToViewportPoint(rect[2], rect[3])
	const clamp = (value: number) => Math.min(1, Math.max(0, value))
	return {
		topLeft: { x: clamp(Math.min(ax, bx) / viewport.width), y: clamp(Math.min(ay, by) / viewport.height) },
		bottomRight: { x: clamp(Math.max(ax, bx) / viewport.width), y: clamp(Math.max(ay, by) / viewport.height) },
	}
}
