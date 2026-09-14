import { describe, expect, it } from 'vitest'
import {
	buildTree,
	dropPlacement,
	dropZone,
	flattenVisible,
	isDescendantOrSelf,
	labelShapes,
	nextRow,
	OutlineShape,
	parentRow,
	prevRow,
	rangeSelect,
} from './tree-model'

const PAGE = 'page:1'

const shape = (id: string, type: string, index: string, parentId = PAGE, extra = {}): OutlineShape => ({
	id,
	type,
	index,
	parentId,
	isLocked: false,
	isHidden: false,
	...extra,
})

// frame (a2) contains line1 (a1), group (a2) which contains line2 (a1), line3 (a2)
const SHAPES = [
	shape('rect', 'geo', 'a1'),
	shape('frame', 'frame', 'a2', PAGE, { name: 'pipeline v1' }),
	shape('line1', 'line', 'a1', 'frame'),
	shape('group', 'group', 'a2', 'frame'),
	shape('line2', 'line', 'a1', 'group'),
	shape('line3', 'line', 'a2', 'group'),
	shape('text', 'text', 'a3', PAGE, { text: '  hello world\nsecond line' }),
]

describe('labelShapes', () => {
	it('prefers name, then text, then numbered type by z-order', () => {
		const labels = labelShapes(SHAPES)
		expect(labels.get('frame')).toBe('pipeline v1')
		expect(labels.get('text')).toBe('hello world')
		expect(labels.get('rect')).toBe('Shape 1')
		expect(['Line 1', 'Line 2', 'Line 3']).toContain(labels.get('line1'))
		expect(new Set(['line1', 'line2', 'line3'].map((id) => labels.get(id))).size).toBe(3)
	})
})

describe('buildTree / flattenVisible', () => {
	const tree = buildTree(SHAPES, PAGE)

	it('nests children and sorts topmost first', () => {
		expect(tree.map((n) => n.shape.id)).toEqual(['text', 'frame', 'rect'])
		expect(tree[1].children.map((n) => n.shape.id)).toEqual(['group', 'line1'])
	})

	it('only descends into expanded nodes', () => {
		expect(flattenVisible(tree, new Set()).map((r) => r.id)).toEqual(['text', 'frame', 'rect'])
		const rows = flattenVisible(tree, new Set(['frame', 'group']))
		expect(rows.map((r) => [r.id, r.depth])).toEqual([
			['text', 0],
			['frame', 0],
			['group', 1],
			['line3', 2],
			['line2', 2],
			['line1', 1],
			['rect', 0],
		])
	})

	it('filter keeps ancestors and force-expands them', () => {
		const labels = labelShapes(SHAPES)
		const rows = flattenVisible(tree, new Set(), labels.get('line2'))
		expect(rows.map((r) => r.id)).toEqual(['frame', 'group', 'line2'])
	})

	it('marks descendants of hidden shapes', () => {
		const hidden = buildTree(
			SHAPES.map((s) => (s.id === 'frame' ? { ...s, isHidden: true } : s)),
			PAGE
		)
		const rows = flattenVisible(hidden, new Set(['frame']))
		expect(rows.find((r) => r.id === 'frame')?.isInheritedHidden).toBe(false)
		expect(rows.find((r) => r.id === 'line1')?.isInheritedHidden).toBe(true)
	})
})

describe('navigation and range selection', () => {
	const rows = flattenVisible(buildTree(SHAPES, PAGE), new Set(['frame']))

	it('moves between rows and clamps at the ends', () => {
		expect(nextRow(rows, undefined)?.id).toBe('text')
		expect(nextRow(rows, 'frame')?.id).toBe('group')
		expect(nextRow(rows, 'rect')?.id).toBe('rect')
		expect(prevRow(rows, 'text')?.id).toBe('text')
		expect(prevRow(rows, 'group')?.id).toBe('frame')
		expect(parentRow(rows, 'line1')?.id).toBe('frame')
		expect(parentRow(rows, 'frame')).toBeUndefined()
	})

	it('selects inclusive ranges in either direction', () => {
		expect(rangeSelect(rows, 'text', 'group')).toEqual(['text', 'frame', 'group'])
		expect(rangeSelect(rows, 'group', 'text')).toEqual(['text', 'frame', 'group'])
		expect(rangeSelect(rows, 'missing', 'rect')).toEqual(['rect'])
	})
})

describe('drag and drop', () => {
	const tree = buildTree(SHAPES, PAGE)
	const rows = flattenVisible(tree, new Set(['frame', 'group']))
	const row = (id: string) => rows.find((r) => r.id === id)!

	it('splits containers into three bands and leaves in two', () => {
		expect(dropZone(0, 28, 2, true)).toBe('before')
		expect(dropZone(0, 28, 14, true)).toBe('inside')
		expect(dropZone(0, 28, 26, true)).toBe('after')
		expect(dropZone(0, 28, 13, false)).toBe('before')
		expect(dropZone(0, 28, 15, false)).toBe('after')
	})

	it('places before (above) a target at a higher index', () => {
		expect(dropPlacement(tree, PAGE, row('frame'), 'before', new Set(['rect']))).toEqual({
			parentId: PAGE,
			below: 'a2',
			above: 'a3',
		})
	})

	it('places after (below) a target, skipping dragged siblings', () => {
		expect(dropPlacement(tree, PAGE, row('text'), 'after', new Set(['frame']))).toEqual({
			parentId: PAGE,
			below: 'a1',
			above: 'a3',
		})
	})

	it('drops inside a container on top of its children', () => {
		expect(dropPlacement(tree, PAGE, row('group'), 'inside', new Set(['rect']))).toEqual({
			parentId: 'group',
			below: 'a2',
		})
	})

	it('detects dropping into own subtree', () => {
		expect(isDescendantOrSelf(tree, 'frame', 'line2')).toBe(true)
		expect(isDescendantOrSelf(tree, 'group', 'line1')).toBe(false)
	})
})
