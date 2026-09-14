import { prepareFuzzySearch } from 'obsidian'
import * as React from 'react'
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'

export interface LinkTargetOption {
	path: string
	basename: string
	extension: string
}

export interface LinkPopoverProps {
	files: LinkTargetOption[]
	/** Existing link, e.g. `[[meeting-notes#Agenda]]` or `https://…`. */
	initialLink?: string
	onSave: (link: string) => void
	onRemove?: () => void
	onCancel: () => void
	maxSuggestions?: number
}

const URL_PATTERN = /^\w+:\/\//

/** `[[path#sub|alias]]` → `path#sub`; anything else is returned trimmed. */
export function unwrapWikilink(link: string) {
	const match = /^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/.exec(link.trim())
	return match ? match[1] : link.trim()
}

/** Turn what's typed into what gets stored: web links as-is, vault links as wikilinks. */
export function toStoredLink(text: string) {
	const value = unwrapWikilink(text)
	if (value === '') return ''
	if (URL_PATTERN.test(value)) return value
	return `[[${value}]]`
}

function linktextFor(file: LinkTargetOption) {
	return file.extension === 'md' ? file.path.replace(/\.md$/, '') : file.path
}

function folderOf(path: string) {
	const slash = path.lastIndexOf('/')
	return slash === -1 ? '' : path.slice(0, slash)
}

function LinkGlyph() {
	return (
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
		</svg>
	)
}

export function LinkPopover({ files, initialLink, onSave, onRemove, onCancel, maxSuggestions = 6 }: LinkPopoverProps) {
	const [text, setText] = useState(() => unwrapWikilink(initialLink ?? ''))
	const [highlighted, setHighlighted] = useState(0)
	// Suggestions hide after picking a file so Enter saves (and `#heading` can be typed).
	const [suggesting, setSuggesting] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
		inputRef.current?.select()
	}, [])

	const isUrl = URL_PATTERN.test(text.trim())

	const suggestions = useMemo(() => {
		const query = text.split('#')[0].trim()
		if (!suggesting || isUrl || query === '') return []
		const search = prepareFuzzySearch(query)
		return files
			.map((file) => ({ file, match: search(file.path) }))
			.filter((entry): entry is { file: LinkTargetOption; match: NonNullable<typeof entry.match> } => entry.match !== null)
			.sort((a, b) => b.match.score - a.match.score)
			.slice(0, maxSuggestions)
			.map((entry) => entry.file)
	}, [text, suggesting, isUrl, files, maxSuggestions])

	const pick = (file: LinkTargetOption) => {
		setText(linktextFor(file))
		setSuggesting(false)
		inputRef.current?.focus()
	}

	const save = () => {
		const link = toStoredLink(text)
		if (link === '') return
		onSave(link)
	}

	const onKeyDown = (evt: KeyboardEvent<HTMLInputElement>) => {
		if (evt.key === 'Escape') {
			evt.preventDefault()
			onCancel()
			return
		}
		if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
			if (suggestions.length === 0) return
			evt.preventDefault()
			const delta = evt.key === 'ArrowDown' ? 1 : -1
			setHighlighted((i) => (i + delta + suggestions.length) % suggestions.length)
			return
		}
		if (evt.key !== 'Enter') return
		evt.preventDefault()
		const choice = suggestions[highlighted]
		if (choice) {
			pick(choice)
			return
		}
		save()
	}

	return (
		<div className="ptl-link-popover" role="dialog" aria-label="Edit link">
			<div className="ptl-link-popover-field">
				<span className="ptl-link-popover-glyph">
					<LinkGlyph />
				</span>
				<input
					ref={inputRef}
					className="ptl-link-popover-input"
					value={text}
					placeholder="Search notes or paste a URL"
					spellCheck={false}
					onChange={(evt) => {
						setText(evt.target.value)
						setSuggesting(true)
						setHighlighted(0)
					}}
					onKeyDown={onKeyDown}
				/>
			</div>

			{isUrl && (
				<div className="ptl-link-popover-hint">
					Web link <span className="ptl-link-popover-muted">opens in your browser</span>
				</div>
			)}

			{suggestions.length > 0 && (
				<ul className="ptl-link-popover-suggestions" role="listbox">
					{suggestions.map((file, i) => (
						<li
							key={file.path}
							role="option"
							aria-selected={i === highlighted}
							className={i === highlighted ? 'ptl-link-popover-suggestion is-highlighted' : 'ptl-link-popover-suggestion'}
							onMouseEnter={() => setHighlighted(i)}
							onMouseDown={(evt) => {
								evt.preventDefault()
								pick(file)
							}}
						>
							<span className="ptl-link-popover-name">{file.basename}</span>
							{file.extension !== 'md' && <span className="ptl-link-popover-ext">{file.extension}</span>}
							<span className="ptl-link-popover-folder">{folderOf(file.path)}</span>
						</li>
					))}
				</ul>
			)}

			<div className="ptl-link-popover-footer">
				{onRemove && initialLink && (
					<button className="ptl-link-popover-button is-danger" onClick={onRemove}>
						Remove
					</button>
				)}
				<span className="ptl-link-popover-spacer" />
				<button className="ptl-link-popover-button" onClick={onCancel}>
					Cancel
				</button>
				<button className="ptl-link-popover-button is-primary" disabled={toStoredLink(text) === ''} onClick={save}>
					Save
				</button>
			</div>
		</div>
	)
}
