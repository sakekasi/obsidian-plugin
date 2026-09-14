import { ComponentType, useEffect } from 'react'
import TldrawPlugin from 'src/main'
import {
	dedupeHotkeys,
	kbdToHotkeys,
	overrideObsidianHotkeys,
} from 'src/obsidian/plugin/hotkey-overrides'
import { useActions, useEditor, useTools, useValue } from 'tldraw'

/**
 * While this editor is focused, give tldraw's shortcuts priority over Obsidian hotkeys
 * that use the same keys (e.g. Mod+K).
 */
export function createHotkeyOverrides(plugin: TldrawPlugin): ComponentType {
	return function HotkeyOverrides() {
		const editor = useEditor()
		const actions = useActions()
		const tools = useTools()
		const isFocused = useValue('is focused', () => editor.getInstanceState().isFocused, [editor])

		useEffect(() => {
			if (!isFocused) return

			// Unmodified keys don't collide with Obsidian commands in practice, and leaving
			// them alone keeps the override as narrow as possible.
			const hotkeys = [...Object.values(actions), ...Object.values(tools)]
				.flatMap((item) => (item.kbd ? kbdToHotkeys(item.kbd) : []))
				.filter((hotkey) => hotkey.modifiers.length > 0)

			return overrideObsidianHotkeys(plugin.app, dedupeHotkeys(hotkeys))
		}, [isFocused, actions, tools])

		return null
	}
}
