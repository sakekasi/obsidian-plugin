import { describe, expect, it } from 'vitest'
import { dedupeHotkeys, kbdToHotkeys } from './hotkey-overrides'

describe('kbdToHotkeys', () => {
	it('parses legacy kbd strings', () => {
		expect(kbdToHotkeys('$k')).toEqual([{ modifiers: ['Mod'], key: 'k' }])
		expect(kbdToHotkeys('!k')).toEqual([{ modifiers: ['Shift'], key: 'k' }])
		expect(kbdToHotkeys('$!?z')).toEqual([{ modifiers: ['Mod', 'Shift', 'Alt'], key: 'z' }])
	})

	it('parses tldraw 5 kbd strings, e.g. duplicate', () => {
		expect(kbdToHotkeys('cmd+d,ctrl+d')).toEqual([
			{ modifiers: ['Mod'], key: 'd' },
			{ modifiers: ['Mod'], key: 'd' },
		])
		expect(kbdToHotkeys('cmd+shift+z')).toEqual([{ modifiers: ['Mod', 'Shift'], key: 'z' }])
		expect(kbdToHotkeys('alt+shift+k')).toEqual([{ modifiers: ['Alt', 'Shift'], key: 'k' }])
	})

	it('handles "+" as the key and unmodified keys', () => {
		expect(kbdToHotkeys('cmd++')).toEqual([{ modifiers: ['Mod'], key: '+' }])
		expect(kbdToHotkeys('v')).toEqual([{ modifiers: [], key: 'v' }])
	})

	it('dedupes cmd/ctrl alternatives into one Mod hotkey', () => {
		expect(dedupeHotkeys(kbdToHotkeys('cmd+d,ctrl+d'))).toEqual([{ modifiers: ['Mod'], key: 'd' }])
	})
})
