import * as React from 'react'
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Sections register themselves on mount so the sidebar can build a sub-nav
// for whichever gallery is showing (mirrors diffractions' gallery registry).

export interface GallerySectionEntry {
	id: string
	title: string
}

interface GalleryRegistry {
	sections: GallerySectionEntry[]
	register: (entry: GallerySectionEntry) => () => void
}

const GalleryRegistryContext = createContext<GalleryRegistry | undefined>(undefined)

export function GalleryRegistryProvider({ children }: { children: ReactNode }) {
	const [sections, setSections] = useState<GallerySectionEntry[]>([])

	const register = useCallback((entry: GallerySectionEntry) => {
		setSections((prev) => [...prev.filter((s) => s.id !== entry.id), entry])
		return () => setSections((prev) => prev.filter((s) => s.id !== entry.id))
	}, [])

	const value = useMemo(() => ({ sections, register }), [sections, register])

	return <GalleryRegistryContext.Provider value={value}>{children}</GalleryRegistryContext.Provider>
}

export function useGalleryRegistry() {
	return useContext(GalleryRegistryContext)
}

export function gallerySectionId(title: string) {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}

export function GallerySection({
	title,
	description,
	children,
}: {
	title: string
	description?: ReactNode
	children: ReactNode
}) {
	const registry = useGalleryRegistry()
	const id = gallerySectionId(title)

	useEffect(() => registry?.register({ id, title }), [registry?.register, id, title])

	return (
		<section id={id} className="gallery-section">
			<h2 className="gallery-section-title">{title}</h2>
			{description && <p className="gallery-section-description">{description}</p>}
			{children}
		</section>
	)
}

/** Dashed placeholder frame for things that aren't built yet. */
export function GalleryBox({ children }: { children?: ReactNode }) {
	return <div className="gallery-box">{children}</div>
}
