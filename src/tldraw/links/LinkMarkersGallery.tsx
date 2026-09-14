import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Editor, TLComponents, Tldraw } from 'tldraw'
import { GallerySection } from '../../../gallery/registry'
import { useGalleryTheme } from '../../../gallery/use-gallery-theme'
import { TLDRAW_LICENSE_KEY } from '../license'
import { LinkHoverRequest, LinkMarkers, LinkOpenRequest } from './LinkMarkers'
import 'src/styles/link-markers.css'

export const title = 'Link Markers'

type Scene = Parameters<Editor['createShapes']>[0]

const BASIC_SCENE: Scene = [
	{
		type: 'geo',
		x: 0,
		y: 0,
		props: { w: 220, h: 140, geo: 'rectangle', fill: 'semi', color: 'violet' },
		meta: { link: '[[meeting-notes]]' },
	},
	{
		type: 'geo',
		x: 280,
		y: 20,
		props: { w: 150, h: 150, geo: 'ellipse', fill: 'semi', color: 'blue' },
		meta: { link: 'https://tldraw.dev' },
	},
	{
		type: 'note',
		x: 490,
		y: 0,
		props: { color: 'yellow' },
		meta: { link: '[[Attachments/lecture-notes.pdf#page=3]]' },
	},
	{
		type: 'geo',
		x: 0,
		y: 220,
		props: { w: 220, h: 110, geo: 'rectangle', fill: 'none', dash: 'dashed' },
	},
	{
		type: 'frame',
		x: 280,
		y: 240,
		props: { w: 420, h: 200, name: 'Linked frame' },
		meta: { link: '[[Projects/thesis/chapter-1]]' },
	},
]

const DENSE_SCENE: Scene = Array.from({ length: 36 }, (_, i) => ({
	type: 'geo' as const,
	x: (i % 9) * 90,
	y: Math.floor(i / 9) * 90,
	props: { w: 60, h: 60, geo: 'rectangle', fill: 'semi', color: i % 3 === 0 ? 'red' : 'grey' },
	meta: i % 3 === 0 ? {} : { link: `[[Daily/2026-09-${String((i % 28) + 1).padStart(2, '0')}]]` },
}))

function CanvasStory({ scene, height = 460 }: { scene: Scene; height?: number }) {
	const theme = useGalleryTheme()
	const [editor, setEditor] = useState<Editor | null>(null)
	const [log, setLog] = useState<string[]>([])

	const push = useCallback((entry: string) => setLog((prev) => [entry, ...prev].slice(0, 12)), [])
	const onOpen = useCallback(
		({ link, newTab }: LinkOpenRequest) => push(`open ${link}${newTab ? ' (new tab)' : ''}`),
		[push]
	)
	const onHover = useCallback(({ link }: LinkHoverRequest) => push(`hover-link ${link}`), [push])

	const components = useMemo<TLComponents>(
		() => ({ InFrontOfTheCanvas: () => <LinkMarkers onOpen={onOpen} onHover={onHover} /> }),
		[onOpen, onHover]
	)

	useEffect(() => {
		editor?.user.updateUserPreferences({ colorScheme: theme })
	}, [editor, theme])

	return (
		<div>
			<div style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--background-modifier-border)' }}>
				<Tldraw
					licenseKey={TLDRAW_LICENSE_KEY}
					components={components}
					autoFocus={false}
					onMount={(mounted) => {
						mounted.createShapes(scene)
						mounted.zoomToFit({ animation: { duration: 0 } })
						mounted.selectNone()
						setEditor(mounted)
					}}
				/>
			</div>
			<div className="gallery-log">
				{log.length === 0
					? 'Cmd/Ctrl-click a linked shape (add Shift for a new tab), or click / hover a marker.'
					: log.map((e, i) => <div key={i}>{e}</div>)}
			</div>
		</div>
	)
}

export default function LinkMarkersGallery() {
	return (
		<>
			<GallerySection
				title="Linked shapes"
				description="Rectangle → note, ellipse → web URL, sticky → PDF page, frame → note. The dashed rectangle has no link. Pan and zoom to check the marker stays a fixed size."
			>
				<CanvasStory scene={BASIC_SCENE} />
			</GallerySection>
			<GallerySection title="Dense scene" description="Many small linked shapes (red ones are unlinked), to judge clutter.">
				<CanvasStory scene={DENSE_SCENE} height={380} />
			</GallerySection>
		</>
	)
}
