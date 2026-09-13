import concourse400Italic from 'src/assets/fonts/ConcourseT-400-Italic.woff2'
import concourse400 from 'src/assets/fonts/ConcourseT-400.woff2'
import concourse700Italic from 'src/assets/fonts/ConcourseT-700-Italic.woff2'
import concourse700 from 'src/assets/fonts/ConcourseT-700.woff2'
import concourse800Italic from 'src/assets/fonts/ConcourseT-800-Italic.woff2'
import concourse800 from 'src/assets/fonts/ConcourseT-800.woff2'
import equity400Italic from 'src/assets/fonts/EquityTextA-400-Italic.woff2'
import equity400 from 'src/assets/fonts/EquityTextA-400.woff2'
import equity700Italic from 'src/assets/fonts/EquityTextA-700-Italic.woff2'
import equity700 from 'src/assets/fonts/EquityTextA-700.woff2'
import { DEFAULT_THEME, DefaultFontStyle, TLFontFace, TLThemeFont } from 'tldraw'

type WeightFiles = { upright: string; italic: string }

type FontFamily = {
	id: string
	name: string
	fallback: string
	/** Weights from lightest to heaviest. */
	weights: [weight: string, files: WeightFiles][]
}

/**
 * Fonts added to the style panel next to draw/sans/serif/mono, one option per weight.
 *
 * Italics come from the text editor's italic toggle, and bold uses the next heavier weight.
 * The font files are bundled as data URLs, so they render on the canvas and embed in exports
 * and embed previews without depending on anything in the vault.
 */
const CUSTOM_FONT_FAMILIES: FontFamily[] = [
	{
		id: 'equity',
		name: 'Equity Text A',
		fallback: 'serif',
		weights: [
			['400', { upright: equity400, italic: equity400Italic }],
			['700', { upright: equity700, italic: equity700Italic }],
		],
	},
	{
		id: 'concourse',
		name: 'Concourse',
		fallback: 'sans-serif',
		weights: [
			['400', { upright: concourse400, italic: concourse400Italic }],
			['700', { upright: concourse700, italic: concourse700Italic }],
			['800', { upright: concourse800, italic: concourse800Italic }],
		],
	},
]

function toFaces(family: string, weight: 'normal' | 'bold', files: WeightFiles): TLFontFace[] {
	return [
		{ family, weight, style: 'normal', src: { url: files.upright, format: 'woff2' } },
		{ family, weight, style: 'italic', src: { url: files.italic, format: 'woff2' } },
	]
}

function toThemeFonts({ id, name, fallback, weights }: FontFamily) {
	return weights.map(([weight, files], index): [string, TLThemeFont] => {
		const family = `${name} ${weight}`
		const bolder = weights[index + 1]?.[1]
		const faces = [
			...toFaces(family, 'normal', files),
			...(bolder ? toFaces(family, 'bold', bolder) : []),
		]
		// Themes are cloned with `structuredClone`, so the icon must be a string. `none` renders an
		// empty placeholder that `styles.css` fills with a sample of the font.
		return [`${id}-${weight}`, { fontFamily: `"${family}", ${fallback}`, faces, icon: 'none' }]
	})
}

const customThemeFonts = CUSTOM_FONT_FAMILIES.flatMap(toThemeFonts)

/**
 * Style panel labels for the custom fonts, keyed by translation id.
 */
export const customFontTranslations = Object.fromEntries(
	CUSTOM_FONT_FAMILIES.flatMap(({ id, name, weights }) =>
		weights.map(([weight]) => [`font-style.${id}-${weight}`, `${name} ${weight}`])
	)
)

// Register the values before any store is created, otherwise documents using them fail validation.
DefaultFontStyle.addValues(
	...(customThemeFonts.map(([value]) => value) as unknown as Parameters<
		typeof DefaultFontStyle.addValues
	>)
)

// `resolveThemes` spreads this shared object into every editor's themes, including the ones
// created by `TldrawImage`, so registering the fonts here makes them available everywhere.
Object.assign(DEFAULT_THEME.fonts, Object.fromEntries(customThemeFonts))
