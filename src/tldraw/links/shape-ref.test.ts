import { describe, expect, it } from 'vitest'
import { shapeOptionsFromSnapshot } from './shape-ref'

const page = { typeName: 'page', id: 'page:1' }
const record = (id: string, type: string, parentId: string, extra: Record<string, unknown> = {}) => ({
	typeName: 'shape',
	id: `shape:${id}`,
	type,
	parentId,
	props: {},
	meta: {},
	...extra,
})

describe('shapeOptionsFromSnapshot', () => {
	it('prefers the outline panel name over frame names and text', () => {
		const options = shapeOptionsFromSnapshot([
			page,
			record('frame', 'frame', 'page:1', { props: { name: 'Canvas title' }, meta: { name: 'Panel name' } }),
			record('group', 'group', 'page:1', { meta: { name: 'scaffold' } }),
			record('text', 'text', 'page:1', { props: { richText: { content: [{ text: 'hello' }] } } }),
			record('plainFrame', 'frame', 'page:1', { props: { name: 'Only title' } }),
		])
		const byId = Object.fromEntries(options.map((o) => [o.id, o]))
		expect(byId['shape:frame']).toMatchObject({ label: 'Panel name', kind: 'frame' })
		expect(byId['shape:group']).toMatchObject({ label: 'scaffold', kind: 'shape' })
		expect(byId['shape:text']).toMatchObject({ label: 'hello', kind: 'text' })
		expect(byId['shape:plainFrame']).toMatchObject({ label: 'Only title', kind: 'frame' })
	})

	it('marks hidden shapes and everything inside a hidden parent', () => {
		const options = shapeOptionsFromSnapshot([
			page,
			record('frame', 'frame', 'page:1', { meta: { hidden: true } }),
			record('child', 'geo', 'shape:frame'),
			record('visible', 'geo', 'page:1', { meta: { hidden: false } }),
		])
		const hidden = Object.fromEntries(options.map((o) => [o.id, o.isHidden]))
		expect(hidden).toEqual({ 'shape:frame': true, 'shape:child': true, 'shape:visible': false })
		expect(options.find((o) => o.id === 'shape:child')?.pageId).toBe('page:1')
	})
})
