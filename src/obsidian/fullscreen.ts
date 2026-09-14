import { useEffect, useState } from 'react'

/**
 * "Fullscreen" hides Obsidian's chrome (ribbon, sidebars, other panes, tab headers, view header,
 * status bar, title bar) so one drawing fills the window, like Excalidraw's fullscreen mode.
 *
 * Every ancestor of the view's content element is tagged KEEP and the content element itself is
 * tagged TARGET. CSS then hides every child of a KEEP element that isn't itself KEEP. Obsidian's
 * modals, menus and notices are appended to <body>, which is never tagged, so they still show.
 */
const BODY_CLASS = 'ptl-fullscreen'
const KEEP_CLASS = 'ptl-fullscreen-keep'
const TARGET_CLASS = 'ptl-fullscreen-target'

export function isFullscreen(doc: Document) {
	return doc.body.classList.contains(BODY_CLASS)
}

/** Whether `el` lives inside the view that is currently fullscreen. */
export function isInFullscreenTarget(el: Element) {
	return isFullscreen(el.ownerDocument) && !!el.closest(`.${TARGET_CLASS}`)
}

export function enterFullscreen(contentEl: HTMLElement) {
	const doc = contentEl.ownerDocument
	exitFullscreen(doc)
	contentEl.classList.add(KEEP_CLASS, TARGET_CLASS)
	let el = contentEl.parentElement
	while (el && el !== doc.body) {
		el.classList.add(KEEP_CLASS)
		el = el.parentElement
	}
	doc.body.classList.add(BODY_CLASS)
}

export function exitFullscreen(doc: Document) {
	doc.body.classList.remove(BODY_CLASS)
	doc.querySelectorAll(`.${KEEP_CLASS}`).forEach((el) => el.classList.remove(KEEP_CLASS, TARGET_CLASS))
}

export function toggleFullscreen(contentEl: HTMLElement) {
	if (isInFullscreenTarget(contentEl)) return exitFullscreen(contentEl.ownerDocument)
	enterFullscreen(contentEl)
}

/** The Obsidian view content element hosting a tldraw editor container, if any (not embeds). */
export function getViewContentEl(container: HTMLElement) {
	return container.closest<HTMLElement>('.tldraw-view-content')
}

/** Re-renders when fullscreen is entered or exited for the view containing `container`. */
export function useIsInFullscreenTarget(container: HTMLElement) {
	const [value, setValue] = useState(() => isInFullscreenTarget(container))
	useEffect(() => {
		const body = container.ownerDocument.body
		const observer = new MutationObserver(() => setValue(isInFullscreenTarget(container)))
		observer.observe(body, { attributes: true, attributeFilter: ['class'] })
		return () => observer.disconnect()
	}, [container])
	return value
}
