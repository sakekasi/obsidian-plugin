import * as React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { TLPageId, useEditor, useTldrawUiComponents, useValue } from 'tldraw'
import { IconButton, RenameInput } from './controls'
import { Icon } from './icons'
import { LayersSection } from './LayersSection'
import { useOutlinePanelState } from './use-outline'

const MIN_WIDTH = 200
const MAX_WIDTH = 480

export interface OutlinePanelProps {
	/** Shown in the header and the collapsed pill, e.g. the file name. */
	title: string
}

/**
 * Figma-style outline panel. Rendered in tldraw's MenuPanel slot, so it replaces the
 * top-left main and page menus; the main menu opens from the panel's leading button.
 */
export function OutlinePanel({ title }: OutlinePanelProps) {
	const editor = useEditor()
	const [state, update] = useOutlinePanelState(editor)
	const [dragWidth, setDragWidth] = useState<number>()
	const panelRef = useRef<HTMLDivElement>(null)
	const width = dragWidth ?? state.width

	// The open panel is absolutely positioned, so tldraw's helper buttons ("Back to content") in the
	// same zone can't flow around it. Publish its width so CSS can push them clear.
	useLayoutEffect(() => {
		const zone = panelRef.current?.parentElement
		if (!zone) return
		zone.style.setProperty('--ptl-outline-width', `${width}px`)
		return () => {
			zone.style.removeProperty('--ptl-outline-width')
		}
	}, [width, state.collapsed])

	if (state.collapsed) {
		return (
			<div className="ptl-outline ptl-outline--pill">
				<MainMenuButton />
				<span className="ptl-outline__title">{title}</span>
				<IconButton title="Show layers" onClick={() => update({ collapsed: false })}>
					<Icon.Sidebar />
				</IconButton>
			</div>
		)
	}

	return (
		<div ref={panelRef} className="ptl-outline ptl-outline--expanded" style={{ width }}>
			<header className="ptl-outline-header">
				<MainMenuButton />
				<span className="ptl-outline__title">{title}</span>
				<IconButton title="Hide layers" onClick={() => update({ collapsed: true })}>
					<Icon.Sidebar />
				</IconButton>
			</header>
			<PagesSection />
			<LayersSection />
			<div
				className="ptl-outline-resize"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId)
					setDragWidth(state.width)
				}}
				onPointerMove={(e) => {
					if (dragWidth === undefined) return
					const left = e.currentTarget.parentElement!.getBoundingClientRect().left
					setDragWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - left)))
				}}
				onPointerUp={() => {
					if (dragWidth === undefined) return
					update({ width: Math.round(dragWidth) })
					setDragWidth(undefined)
				}}
			/>
		</div>
	)
}

function MainMenuButton() {
	const { MainMenu } = useTldrawUiComponents()
	if (!MainMenu) return null
	return (
		<span className="ptl-outline__menu">
			<MainMenu />
		</span>
	)
}

function PagesSection() {
	const editor = useEditor()
	const pages = useValue('outline pages', () => editor.getPages(), [editor])
	const currentPageId = useValue('outline current page', () => editor.getCurrentPageId(), [editor])
	const [renamingId, setRenamingId] = useState<TLPageId>()
	const isReadonly = useValue('outline readonly', () => editor.getIsReadonly(), [editor])

	const addPage = () => {
		editor.markHistoryStoppingPoint('outline create page')
		editor.run(() => {
			editor.createPage({ name: `Page ${pages.length + 1}` })
			const created = editor.getPages().at(-1)
			if (created) editor.setCurrentPage(created.id)
		})
	}

	return (
		<section className="ptl-outline-section ptl-outline-pages">
			<div className="ptl-outline-section__header">
				<span className="ptl-outline-section__title">Pages</span>
				{!isReadonly && (
					<IconButton title="Add page" onClick={addPage}>
						<Icon.Plus />
					</IconButton>
				)}
			</div>
			<div className="ptl-outline-list" role="listbox" aria-label="Pages">
				{pages.map((page) => (
					<div
						key={page.id}
						role="option"
						aria-selected={page.id === currentPageId}
						className={`ptl-outline-row ptl-outline-row--page ${page.id === currentPageId ? 'is-current' : ''}`}
						onClick={() => editor.setCurrentPage(page.id)}
						onDoubleClick={() => {
							if (!isReadonly) setRenamingId(page.id)
						}}
					>
						{renamingId === page.id ? (
							<RenameInput
								initial={page.name}
								onCommit={(value) => {
									setRenamingId(undefined)
									if (!value.trim() || value.trim() === page.name) return
									editor.markHistoryStoppingPoint('outline rename page')
									editor.renamePage(page.id, value.trim())
								}}
								onCancel={() => setRenamingId(undefined)}
							/>
						) : (
							<span className="ptl-outline-row__label">{page.name}</span>
						)}
					</div>
				))}
			</div>
		</section>
	)
}
