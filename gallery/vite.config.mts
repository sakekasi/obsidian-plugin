import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from '../node_modules/tldraw/package.json'

const repoRoot = path.resolve(import.meta.dirname, '..')

// Standalone dev server for prototyping plugin UI outside of Obsidian.
// `obsidian` is aliased to a small shim so native Modal/Setting code runs in a browser.
export default defineConfig({
	root: import.meta.dirname,
	plugins: [react()],
	resolve: {
		alias: {
			obsidian: path.resolve(import.meta.dirname, 'obsidian-shim.ts'),
			src: path.resolve(repoRoot, 'src'),
		},
	},
	define: {
		'process.env.NODE_ENV': JSON.stringify('development'),
		TLDRAW_VERSION: JSON.stringify(version),
		MARKDOWN_POST_PROCESSING_LOGGING: 'false',
		TLDRAW_COMPONENT_LOGGING: 'false',
	},
	server: {
		port: 5199,
		fs: { allow: [repoRoot] },
	},
})
