import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			src: path.resolve(import.meta.dirname, 'src'),
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
	},
})
