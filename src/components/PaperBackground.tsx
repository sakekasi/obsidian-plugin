import * as React from 'react'
import { useEditor, useQuickReactor } from 'tldraw'

/** Base tile size (in page units) of the paper grain texture set in tldraw-theme-overrides.css */
const TEXTURE_TILE_SIZE = 240

/**
 * Canvas background whose paper texture pans and zooms with the camera,
 * so the grain feels attached to the drawing rather than the screen.
 */
export default function PaperBackground() {
	const editor = useEditor()
	const ref = React.useRef<HTMLDivElement>(null)

	useQuickReactor(
		'paper background camera',
		() => {
			const el = ref.current
			if (!el) return
			const { x, y, z } = editor.getCamera()
			const size = TEXTURE_TILE_SIZE * z
			el.style.backgroundSize = `${size}px ${size}px`
			el.style.backgroundPosition = `${x * z}px ${y * z}px`
		},
		[editor]
	)

	return <div ref={ref} className="tl-background" />
}
