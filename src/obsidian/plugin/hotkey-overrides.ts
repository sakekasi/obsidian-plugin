import { App, KeymapEventHandler, Modifier, Scope } from 'obsidian'

export interface ObsidianHotkey {
	modifiers: Modifier[]
	key: string
}

const MODIFIER_TOKENS: Record<string, Modifier> = {
	cmd: 'Mod',
	ctrl: 'Mod',
	meta: 'Mod',
	mod: 'Mod',
	shift: 'Shift',
	alt: 'Alt',
	option: 'Alt',
}

/** Legacy tldraw kbd: `$` = Mod, `!` = Shift, `?` = Alt, e.g. `$!k`. */
function parseLegacyCombo(combo: string): ObsidianHotkey {
	return {
		modifiers: [
			...(combo.includes('$') ? (['Mod'] as const) : []),
			...(combo.includes('!') ? (['Shift'] as const) : []),
			...(combo.includes('?') ? (['Alt'] as const) : []),
		],
		key: combo.replace(/[!?$]/g, ''),
	}
}

/**
 * tldraw 5 kbd: `+`-joined tokens, e.g. `cmd+shift+z`. It lists `cmd+…` and `ctrl+…` as separate
 * alternatives for Mac and other platforms; both map to Obsidian's `Mod` and dedupe later.
 */
function parseModernCombo(combo: string): ObsidianHotkey {
	// A trailing "++" means the key itself is "+".
	const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+')
	const modifiers = parts
		.slice(0, -1)
		.map((token) => MODIFIER_TOKENS[token.toLowerCase()])
		.filter((modifier): modifier is Modifier => !!modifier)
	return { modifiers: [...new Set(modifiers)], key: parts[parts.length - 1] }
}

/** Convert a tldraw kbd string (either format, `,` separates alternatives) into Obsidian hotkeys. */
export function kbdToHotkeys(kbd: string): ObsidianHotkey[] {
	return kbd
		.split(',')
		.map((combo) => combo.trim())
		.filter((combo) => combo !== '')
		.map((combo) =>
			combo.includes('+') && !/[$!?]/.test(combo) ? parseModernCombo(combo) : parseLegacyCombo(combo)
		)
		.filter((hotkey) => hotkey.key !== '')
}

export function dedupeHotkeys(hotkeys: ObsidianHotkey[]): ObsidianHotkey[] {
	const byId = new Map(
		hotkeys.map((hotkey) => [`${[...hotkey.modifiers].sort().join('+')}+${hotkey.key}`, hotkey])
	)
	return [...byId.values()]
}

// `getRootScope` and `Scope.keys` are private Obsidian API; the Excalidraw plugin relies on them too.
type ScopeInternals = Scope & { keys: KeymapEventHandler[] }

/**
 * Stop Obsidian's own hotkeys from handling these key combos, so the event reaches tldraw.
 * Handlers that return `true` tell Obsidian the key was not handled, and putting them first
 * means they match before any command hotkey does.
 *
 * @returns A function that removes the overrides.
 */
export function overrideObsidianHotkeys(app: App, hotkeys: ObsidianHotkey[]): () => void {
	const scope = (app.keymap as unknown as { getRootScope(): ScopeInternals }).getRootScope()
	const handlers = hotkeys.map((hotkey) => scope.register(hotkey.modifiers, hotkey.key, () => true))

	// Move our handlers to the front, in place, since Obsidian may hold a reference to the array.
	const ours = new Set(handlers)
	const others = scope.keys.filter((handler) => !ours.has(handler))
	scope.keys.splice(0, scope.keys.length, ...handlers, ...others)

	return () => handlers.forEach((handler) => scope.unregister(handler))
}
