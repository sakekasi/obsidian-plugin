import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createShapeId, Editor, IndexKey, TLComponents, Tldraw, TLShapeId } from 'tldraw'
import { GallerySection } from '../../../gallery/registry'
import { useGalleryTheme } from '../../../gallery/use-gallery-theme'
import { TLDRAW_LICENSE_KEY } from '../license'
import { OutlinePanel } from './OutlinePanel'
import { getShapeVisibility } from './visibility'
import 'src/styles/outline-panel.css'
import 'src/styles/tldraw-theme-overrides.css'

export const title = 'Outline Panel'

const COLORS = ['black', 'blue', 'red', 'green', 'violet', 'orange'] as const

function line(parentId: TLShapeId, x: number, y: number, dx: number, dy: number) {
	return {
		id: createShapeId(),
		type: 'line' as const,
		parentId,
		x,
		y,
		props: {
			points: {
				a1: { id: 'a1', index: 'a1' as IndexKey, x: 0, y: 0 },
				a2: { id: 'a2', index: 'a2' as IndexKey, x: dx, y: dy },
			},
		},
	}
}

function seedPipeline(editor: Editor, name: string, x: number) {
	const frameId = createShapeId()
	editor.createShape({ id: frameId, type: 'frame', x, y: 0, props: { w: 520, h: 380, name } })

	const lines = Array.from({ length: 10 }, (_, i) =>
		line(frameId, 30 + (i % 5) * 90, 250 + Math.floor(i / 5) * 60, 60, i % 2 ? -30 : 30)
	)
	editor.createShapes(lines)

	const boxes = Array.from({ length: 3 }, (_, i) => ({
		id: createShapeId(),
		type: 'geo' as const,
		parentId: frameId,
		x: 30 + i * 160,
		y: 40,
		props: { w: 130, h: 80, geo: 'rectangle' as const, color: COLORS[i + 1], fill: 'semi' as const },
	}))
	editor.createShapes(boxes)
	editor.groupShapes(
		boxes.map((b) => b.id),
		{ select: false }
	)

	const labels = ['encode', 'decode'].map((text, i) => ({
		id: createShapeId(),
		type: 'text' as const,
		parentId: frameId,
		x: 60 + i * 200,
		y: 150,
		props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } },
	}))
	editor.createShapes(labels)
	const scaffoldGroup = editor.groupShapes(
		labels.map((l) => l.id),
		{ select: false }
	)
	const group = editor.getShape(labels[0].id)?.parentId
	if (scaffoldGroup && group) {
		editor.updateShape({ id: group as TLShapeId, type: 'group', meta: { name: 'scaffold' } })
	}
}

function seedFigures(editor: Editor) {
	editor.createShape({
		type: 'geo',
		x: -260,
		y: 0,
		props: { w: 200, h: 140, geo: 'ellipse', fill: 'semi', color: 'violet' },
		meta: { name: 'curiosity-loop' },
	})
	editor.createShape({ type: 'note', x: -260, y: 200, props: { color: 'yellow' } })
	seedPipeline(editor, 'pipeline figure v1', 0)
	seedPipeline(editor, 'pipeline figure v2', 600)
	seedPipeline(editor, 'pipeline figure v3', 1200)

	const hidden = createShapeId()
	editor.createShape({
		id: hidden,
		type: 'geo',
		x: -260,
		y: 440,
		props: { w: 200, h: 80, color: 'red', fill: 'solid' },
		meta: { name: 'hidden draft', hidden: true },
	})
	editor.createShape({
		type: 'geo',
		x: -260,
		y: 560,
		isLocked: true,
		props: { w: 200, h: 80, color: 'grey', fill: 'pattern' },
		meta: { name: 'locked background' },
	})

	const second = editor.createPage({ name: 'Scratch' })
	void second
}

function seedStress(editor: Editor) {
	Array.from({ length: 20 }).forEach((_, f) => {
		const frameId = createShapeId()
		editor.createShape({
			id: frameId,
			type: 'frame',
			x: (f % 5) * 700,
			y: Math.floor(f / 5) * 700,
			props: { w: 640, h: 640, name: `Board ${f + 1}` },
		})
		editor.createShapes(
			Array.from({ length: 24 }, (_, i) => ({
				type: 'geo' as const,
				parentId: frameId,
				x: 20 + (i % 6) * 100,
				y: 20 + Math.floor(i / 6) * 150,
				props: { w: 80, h: 120, color: COLORS[i % COLORS.length] },
			}))
		)
	})
}

function PanelStory({
	seed,
	fileTitle,
	startExpanded,
	height = 640,
}: {
	seed: (editor: Editor) => void
	fileTitle: string
	startExpanded: boolean
	height?: number
}) {
	const theme = useGalleryTheme()
	const [editor, setEditor] = useState<Editor | null>(null)

	const components = useMemo<TLComponents>(
		() => ({ MenuPanel: () => <OutlinePanel title={fileTitle} /> }),
		[fileTitle]
	)

	useEffect(() => {
		editor?.user.updateUserPreferences({ colorScheme: theme })
	}, [editor, theme])

	return (
		<div
			style={{
				height,
				borderRadius: 12,
				overflow: 'hidden',
				border: '1px solid var(--background-modifier-border)',
			}}
		>
			<Tldraw
				licenseKey={TLDRAW_LICENSE_KEY}
				components={components}
				getShapeVisibility={getShapeVisibility}
				autoFocus={false}
				onMount={(mounted) => {
					mounted.run(() => seed(mounted), { history: 'ignore' })
					if (startExpanded) {
						mounted.run(
							() => mounted.updateDocumentSettings({ meta: { outlinePanel: { collapsed: false, width: 280 } } }),
							{ history: 'ignore' }
						)
					}
					mounted.zoomToFit({ animation: { duration: 0 } })
					mounted.selectNone()
					setEditor(mounted)
					// Debug handle for poking at stories from devtools.
					const win = window as unknown as { outlineEditors?: Record<string, Editor> }
					const key = `${fileTitle}${startExpanded ? '' : '-collapsed'}`
					win.outlineEditors = { ...win.outlineEditors, [key]: mounted }
				}}
			/>
		</div>
	)
}

export default function OutlinePanelGallery() {
	return (
		<>
			<GallerySection
				title="Figures file"
				description="Frames with groups, lines and text, plus a named ellipse, a hidden shape and a locked shape. Try: click / cmd-click / shift-click rows, arrow keys, space to rename, right-click, drag rows into frames and groups, the eye and lock toggles, search, collapse all, and selecting on the canvas."
			>
				<PanelStory seed={seedFigures} fileTitle="figures" startExpanded />
			</GallerySection>
			<GallerySection
				title="Collapsed pill"
				description="Default state for a file: a pill with the main menu, file name and an expand button."
			>
				<PanelStory seed={seedFigures} fileTitle="figures" startExpanded={false} height={360} />
			</GallerySection>
			<GallerySection
				title="Stress: 500 shapes"
				description="20 frames × 24 shapes. Check scrolling, collapse all, search and canvas drag performance."
			>
				<PanelStory seed={seedStress} fileTitle="stress-test" startExpanded />
			</GallerySection>
		</>
	)
}
