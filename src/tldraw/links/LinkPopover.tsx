import { prepareFuzzySearch } from 'obsidian'
import * as React from 'react'
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { formatShapeSubpath, ShapeOption, shapeOptionTitle } from './shape-ref'

export interface LinkTargetOption {
	path: string
	basename: string
	extension: string
}

export interface LinkPopoverProps {
	files: LinkTargetOption[]
	/** Existing link, e.g. `[[meeting-notes#Agenda]]` or `https://…`. */
	initialLink?: string
	/**
	 * Shapes that can be linked to after typing `#`. `path` is the text before the `#`;
	 * '' means the current drawing. Return [] for files that aren't drawings.
	 */
	getShapeOptions?: (path: string) => ShapeOption[] | Promise<ShapeOption[]>
	/** A shape in the current drawing was highlighted in the list. */
	onPreviewShape?: (option: ShapeOption) => void
	/** The popover was cancelled after previewing shapes. */
	onPreviewEnd?: () => void
	onSave: (link: string) => void
	onRemove?: () => void
	onCancel: () => void
	maxSuggestions?: number
}

type Suggestion = { kind: 'file'; key: string; file: LinkTargetOption } | { kind: 'shape'; key: string; option: ShapeOption }

type ShapeListState = { path: string; options: ShapeOption[]; loading: boolean }

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

function fuzzyFilter<T>(items: T[], query: string, textOf: (item: T) => string, limit: number) {
	if (query === '') return items.slice(0, limit)
	const search = prepareFuzzySearch(query)
	return items
		.map((item) => ({ item, match: search(textOf(item)) }))
		.filter((entry): entry is { item: T; match: NonNullable<typeof entry.match> } => entry.match !== null)
		.sort((a, b) => b.match.score - a.match.score)
		.slice(0, limit)
		.map((entry) => entry.item)
}

/** Loads (and caches) the shapes for the path before `#`. */
function useShapeOptions(path: string | undefined, getShapeOptions: LinkPopoverProps['getShapeOptions']) {
	const cache = useRef(new Map<string, ShapeOption[]>())
	const [state, setState] = useState<ShapeListState | undefined>(undefined)

	useEffect(() => {
		if (path === undefined || !getShapeOptions) return
		const cached = cache.current.get(path)
		if (cached) {
			setState({ path, options: cached, loading: false })
			return
		}
		let cancelled = false
		setState({ path, options: [], loading: true })
		void Promise.resolve(getShapeOptions(path))
			.catch((error) => {
				console.error('Unable to load shapes for', path, error)
				return []
			})
			.then((options) => {
				cache.current.set(path, options)
				if (cancelled) return
				setState({ path, options, loading: false })
			})
		return () => {
			cancelled = true
		}
	}, [path, getShapeOptions])

	if (path === undefined || state?.path !== path) return undefined
	return state
}

function LinkGlyph() {
	return (
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
		</svg>
	)
}

const SHAPE_KIND_LABEL: Record<ShapeOption['kind'], string> = { text: 'text', frame: 'frame', shape: 'shape' }

export function LinkPopover({
	files,
	initialLink,
	getShapeOptions,
	onPreviewShape,
	onPreviewEnd,
	onSave,
	onRemove,
	onCancel,
	maxSuggestions = 6,
}: LinkPopoverProps) {
	const [text, setText] = useState(() => unwrapWikilink(initialLink ?? ''))
	const [highlighted, setHighlighted] = useState(0)
	// Suggestions hide after picking so Enter saves (and `#heading` can be typed).
	const [suggesting, setSuggesting] = useState(() => unwrapWikilink(initialLink ?? '').endsWith('#'))
	const previewed = useRef(false)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
		inputRef.current?.select()
	}, [])

	const isUrl = URL_PATTERN.test(text.trim())
	const hash = text.indexOf('#')
	const shapeMode = !isUrl && hash !== -1 && getShapeOptions !== undefined
	const shapePath = shapeMode ? text.slice(0, hash).trim() : undefined
	const shapeQuery = shapeMode ? text.slice(hash + 1).replace(/^\^/, '').trim() : ''
	const shapeList = useShapeOptions(suggesting ? shapePath : undefined, getShapeOptions)

	const suggestions = useMemo((): Suggestion[] => {
		if (!suggesting || isUrl) return []
		if (shapeMode) {
			const options = shapeList?.options ?? []
			return fuzzyFilter(options, shapeQuery, shapeOptionTitle, maxSuggestions).map((option) => ({
				kind: 'shape',
				key: option.id,
				option,
			}))
		}
		const query = text.trim()
		if (query === '') return []
		return fuzzyFilter(files, query, (file) => file.path, maxSuggestions).map((file) => ({
			kind: 'file',
			key: file.path,
			file,
		}))
	}, [text, suggesting, isUrl, shapeMode, shapeList, shapeQuery, files, maxSuggestions])

	const current = suggestions[highlighted]
	useEffect(() => {
		if (current?.kind !== 'shape' || shapePath !== '' || !onPreviewShape) return
		previewed.current = true
		onPreviewShape(current.option)
	}, [current, shapePath, onPreviewShape])

	const pick = (suggestion: Suggestion) => {
		const next =
			suggestion.kind === 'file'
				? linktextFor(suggestion.file)
				: `${shapePath ?? ''}${formatShapeSubpath(suggestion.option.id)}`
		setText(next)
		setSuggesting(false)
		inputRef.current?.focus()
	}

	const cancel = () => {
		if (previewed.current) onPreviewEnd?.()
		onCancel()
	}

	const save = () => {
		const link = toStoredLink(text)
		if (link === '') return
		onSave(link)
	}

	const onKeyDown = (evt: KeyboardEvent<HTMLInputElement>) => {
		if (evt.key === 'Escape') {
			evt.preventDefault()
			cancel()
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
		if (current) {
			pick(current)
			return
		}
		save()
	}

	const loadingShapes = suggesting && shapeMode && (shapeList === undefined || shapeList.loading)
	const noShapeMatches =
		suggesting && shapeMode && shapeList?.loading === false && shapeList.options.length > 0 && suggestions.length === 0

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
					placeholder="Search notes, paste a URL, or # for shapes"
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

			{loadingShapes && <div className="ptl-link-popover-hint ptl-link-popover-muted">Loading shapes…</div>}
			{noShapeMatches && <div className="ptl-link-popover-hint ptl-link-popover-muted">No matching shapes</div>}

			{suggestions.length > 0 && (
				<ul className="ptl-link-popover-suggestions" role="listbox">
					{suggestions.map((suggestion, i) => (
						<li
							key={suggestion.key}
							role="option"
							aria-selected={i === highlighted}
							className={[
								'ptl-link-popover-suggestion',
								i === highlighted && 'is-highlighted',
								suggestion.kind === 'shape' && suggestion.option.isHidden && 'is-hidden',
							]
								.filter(Boolean)
								.join(' ')}
							onMouseEnter={() => setHighlighted(i)}
							onMouseDown={(evt) => {
								evt.preventDefault()
								pick(suggestion)
							}}
						>
							{suggestion.kind === 'file' ? (
								<>
									<span className="ptl-link-popover-name">{suggestion.file.basename}</span>
									{suggestion.file.extension !== 'md' && (
										<span className="ptl-link-popover-ext">{suggestion.file.extension}</span>
									)}
									<span className="ptl-link-popover-folder">{folderOf(suggestion.file.path)}</span>
								</>
							) : (
								<>
									<span
										className={
											suggestion.option.label === ''
												? 'ptl-link-popover-name ptl-link-popover-muted'
												: 'ptl-link-popover-name'
										}
									>
										{shapeOptionTitle(suggestion.option)}
									</span>
									<span className="ptl-link-popover-folder">
										{SHAPE_KIND_LABEL[suggestion.option.kind]}
										{suggestion.option.isHidden && ' · hidden'}
									</span>
								</>
							)}
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
				<button className="ptl-link-popover-button" onClick={cancel}>
					Cancel
				</button>
				<button className="ptl-link-popover-button is-primary" disabled={toStoredLink(text) === ''} onClick={save}>
					Save
				</button>
			</div>
		</div>
	)
}
