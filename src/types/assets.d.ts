/**
 * Font files are bundled as data URLs by the esbuild `dataurl` loader.
 */
declare module '*.woff2' {
	const dataUrl: string
	export default dataUrl
}
