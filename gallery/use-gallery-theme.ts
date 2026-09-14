import { useEffect, useState } from 'react'

export type GalleryTheme = 'light' | 'dark'

function readTheme(): GalleryTheme {
	return document.body.classList.contains('theme-dark') ? 'dark' : 'light'
}

/** The gallery's current theme, following the `theme-dark` class on body (set by the sidebar toggle). */
export function useGalleryTheme(): GalleryTheme {
	const [theme, setTheme] = useState(readTheme)

	useEffect(() => {
		const observer = new MutationObserver(() => setTheme(readTheme()))
		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
		return () => observer.disconnect()
	}, [])

	return theme
}
