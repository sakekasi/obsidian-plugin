/// <reference types="vite/client" />
import * as React from 'react'
import { ComponentType, useEffect, useState } from 'react'
import { GalleryRegistryProvider, useGalleryRegistry } from './registry'
import { useHashRoute } from './use-hash-route'

interface GalleryModule {
	default: ComponentType
	title?: string
}

interface GalleryEntry {
	id: string
	label: string
	path: string
	Component: ComponentType
}

// Leaf galleries live next to the code they demo, e.g. src/obsidian/modal/PdfImportModalGallery.tsx
const modules = import.meta.glob<GalleryModule>('../src/**/*Gallery.tsx', { eager: true })

function kebab(name: string) {
	return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function prettify(name: string) {
	return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

const GALLERIES: GalleryEntry[] = Object.entries(modules)
	.map(([path, mod]) => {
		const name = path.split('/').pop()!.replace(/Gallery\.tsx$/, '')
		return {
			id: kebab(name),
			label: mod.title ?? prettify(name),
			path: path.replace(/^\.\.\//, ''),
			Component: mod.default,
		}
	})
	.sort((a, b) => a.label.localeCompare(b.label))

type Theme = 'light' | 'dark'

function useTheme() {
	const [theme, setTheme] = useState<Theme>(() => {
		try {
			return localStorage.getItem('gallery-theme') === 'dark' ? 'dark' : 'light'
		} catch {
			return 'light'
		}
	})

	useEffect(() => {
		document.body.classList.toggle('theme-dark', theme === 'dark')
		document.body.classList.toggle('theme-light', theme === 'light')
		try {
			localStorage.setItem('gallery-theme', theme)
		} catch {
			// Storage may be unavailable; the theme just won't persist.
		}
	}, [theme])

	return [theme, setTheme] as const
}

function SectionNav() {
	const sections = useGalleryRegistry()?.sections ?? []
	if (sections.length === 0) return null

	return (
		<ul className="gallery-subnav">
			{sections.map((section) => (
				<li key={section.id}>
					<button
						className="gallery-subnav-link"
						onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' })}
					>
						{section.title}
					</button>
				</li>
			))}
		</ul>
	)
}

export function GalleryApp() {
	const route = useHashRoute()
	const [theme, setTheme] = useTheme()
	const active = GALLERIES.find((g) => g.id === route) ?? GALLERIES[0]

	return (
		<GalleryRegistryProvider>
			<div className="gallery-layout">
				<nav className="gallery-sidebar">
					<div className="gallery-sidebar-header">
						<span className="gallery-brand">Gallery</span>
						<button
							className="gallery-theme-toggle"
							onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
						>
							{theme === 'dark' ? 'Light' : 'Dark'}
						</button>
					</div>
					<ul className="gallery-nav">
						{GALLERIES.map((g) => (
							<li key={g.id}>
								<a
									href={`#/${g.id}`}
									className={g.id === active?.id ? 'gallery-nav-link is-active' : 'gallery-nav-link'}
								>
									{g.label}
								</a>
								{g.id === active?.id && <SectionNav />}
							</li>
						))}
					</ul>
				</nav>
				<main className="gallery-main">
					{!active ? (
						<p>No galleries found. Add a *Gallery.tsx file under src/.</p>
					) : (
						<>
							<header className="gallery-header">
								<h1>{active.label}</h1>
								<code>{active.path}</code>
							</header>
							{/* Keyed so sections from the previous gallery unregister. */}
							<active.Component key={active.id} />
						</>
					)}
				</main>
			</div>
		</GalleryRegistryProvider>
	)
}
