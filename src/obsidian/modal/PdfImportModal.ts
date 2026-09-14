import { App, ButtonComponent, Modal, setIcon, Setting } from 'obsidian'
import { formatPageRanges, pageRange, parsePageRanges } from 'src/obsidian/pdf/page-ranges'
import { PdfPageSize, PdfPageSource } from 'src/obsidian/pdf/page-source'

export type PageSelectionMode = 'all' | 'range' | 'selection' | 'custom'

export interface PdfImportOptions {
	pages: number[]
	/** Size on the canvas relative to the page's size in points, e.g. 0.3. */
	scale: number
}

export interface PdfImportModalState {
	mode: PageSelectionMode
	rangeFrom: number
	rangeTo: number
	selected: number[]
	custom: string
	/** Percent. */
	scale: number
}

const THUMB_HEIGHT = 150
const DEFAULT_PAGE_SIZE: PdfPageSize = { width: 612, height: 792 }

let radioGroupCount = 0

/**
 * PDF import dialog modelled on the macOS print dialog: a scrolling strip of page
 * thumbnails that toggle on click, with the page-selection radios and scale below.
 */
export class PdfImportModal extends Modal {
	private state: PdfImportModalState
	private readonly pageSizes = new Map<number, PdfPageSize>()
	private readonly radioName = `ptl-pdf-pages-${radioGroupCount++}`
	private observer?: IntersectionObserver

	private thumbEls = new Map<number, HTMLElement>()
	private radioEls = new Map<PageSelectionMode, HTMLInputElement>()
	private rangeFromEl?: HTMLInputElement
	private rangeToEl?: HTMLInputElement
	private selectionCountEl?: HTMLElement
	private customInputEl?: HTMLInputElement
	private customErrorEl?: HTMLElement
	private scaleInputEl?: HTMLInputElement
	private scaleSetting?: Setting
	private importButton?: ButtonComponent

	constructor(
		app: App,
		private readonly fileName: string,
		private readonly source: PdfPageSource,
		private readonly onSubmit: (options: PdfImportOptions) => void,
		initialState: Partial<PdfImportModalState> = {}
	) {
		super(app)
		this.state = {
			mode: 'all',
			rangeFrom: 1,
			rangeTo: source.numPages,
			selected: [],
			custom: '',
			scale: 30,
			...initialState,
		}
	}

	private get pageCount() {
		return this.source.numPages
	}

	selectedPages(): number[] {
		const { mode, rangeFrom, rangeTo, selected, custom } = this.state
		switch (mode) {
			case 'all':
				return pageRange(1, this.pageCount)
			case 'range':
				return pageRange(rangeFrom, rangeTo)
			case 'selection':
				return [...selected].sort((a, b) => a - b)
			case 'custom': {
				const parsed = parsePageRanges(custom, this.pageCount)
				return parsed.ok ? parsed.pages : []
			}
		}
	}

	onOpen() {
		this.modalEl.addClass('ptl-pdf-import-modal')
		this.setTitle('Import PDF')
		this.titleEl.createDiv({ cls: 'ptl-pdf-import-filename', text: this.fileName })

		this.buildThumbnailStrip(this.contentEl)
		this.buildSettings(this.contentEl.createDiv({ cls: 'ptl-pdf-import-settings' }))
		this.buildButtons(this.contentEl.createDiv({ cls: 'modal-button-container' }))

		void this.loadPageSize(1).then(() => this.refresh())
		this.refresh()
	}

	onClose() {
		this.observer?.disconnect()
		this.contentEl.empty()
		this.thumbEls.clear()
		this.radioEls.clear()
	}

	private async loadPageSize(page: number) {
		const cached = this.pageSizes.get(page)
		if (cached) return cached
		const size = await this.source.getPageSize(page)
		this.pageSizes.set(page, size)
		return size
	}

	// -------------------------------------------------------------------------
	// Thumbnails

	private buildThumbnailStrip(parent: HTMLElement) {
		const strip = parent.createDiv({ cls: 'ptl-pdf-import-strip' })

		this.observer = new IntersectionObserver(
			(entries) =>
				entries
					.filter((entry) => entry.isIntersecting)
					.forEach((entry) => {
						this.observer?.unobserve(entry.target)
						void this.renderThumbnail(entry.target as HTMLElement)
					}),
			{ root: strip, rootMargin: '0px 300px' }
		)

		pageRange(1, this.pageCount).forEach((page) => {
			const thumb = strip.createDiv({
				cls: 'ptl-pdf-thumb',
				attr: { role: 'checkbox', tabindex: 0, 'aria-label': `Page ${page}`, 'data-page': page },
			})
			thumb.createDiv({ cls: 'ptl-pdf-thumb-paper' }, (paper) => {
				paper.createEl('canvas')
				paper.createDiv({ cls: 'ptl-pdf-thumb-label' }, (label) => {
					setIcon(label.createSpan({ cls: 'ptl-pdf-thumb-check' }), 'check')
					label.createSpan({ text: `${page}` })
				})
			})

			thumb.addEventListener('click', () => this.togglePage(page))
			thumb.addEventListener('keydown', (evt) => {
				if (evt.key !== ' ' && evt.key !== 'Enter') return
				evt.preventDefault()
				this.togglePage(page)
			})

			this.thumbEls.set(page, thumb)
			this.observer?.observe(thumb)
		})
	}

	private async renderThumbnail(thumb: HTMLElement) {
		const page = Number(thumb.dataset.page)
		const paper = thumb.querySelector<HTMLElement>('.ptl-pdf-thumb-paper')
		const canvas = thumb.querySelector('canvas')
		if (!paper || !canvas) return

		try {
			const size = await this.loadPageSize(page)
			paper.style.aspectRatio = `${size.width} / ${size.height}`
			const scale = (THUMB_HEIGHT * window.devicePixelRatio) / size.height
			await this.source.renderPage(page, canvas, scale)
			thumb.addClass('is-rendered')
		} catch (error) {
			console.error(`Unable to render thumbnail for page ${page}`, error)
			thumb.addClass('is-error')
		}
	}

	private togglePage(page: number) {
		const pages = new Set(this.selectedPages())
		if (pages.has(page)) pages.delete(page)
		else pages.add(page)
		this.state = { ...this.state, mode: 'selection', selected: [...pages] }
		this.refresh()
	}

	// -------------------------------------------------------------------------
	// Settings

	private setMode(mode: PageSelectionMode) {
		if (this.state.mode === mode) return
		const current = this.selectedPages()
		// Carry the current pages into modes that would otherwise start empty.
		const seeded = {
			selected: mode === 'selection' && this.state.selected.length === 0 ? current : this.state.selected,
			custom: mode === 'custom' && this.state.custom.trim() === '' ? formatPageRanges(current) : this.state.custom,
		}
		this.state = { ...this.state, ...seeded, mode }
		this.refresh()
	}

	private buildSettings(card: HTMLElement) {
		const pages = new Setting(card).setName('Pages').setClass('ptl-pdf-import-pages')
		const group = pages.controlEl.createDiv({ cls: 'ptl-pdf-import-radios' })

		this.radioRow(group, 'all', (row) =>
			row.createSpan({ text: this.pageCount === 1 ? 'The only page' : `All ${this.pageCount} pages` })
		)

		this.radioRow(group, 'range', (row) => {
			row.createSpan({ text: 'Range from' })
			this.rangeFromEl = this.numberInput(row, this.state.rangeFrom, (value) => {
				this.state = { ...this.state, mode: 'range', rangeFrom: value }
			})
			row.createSpan({ text: 'to' })
			this.rangeToEl = this.numberInput(row, this.state.rangeTo, (value) => {
				this.state = { ...this.state, mode: 'range', rangeTo: value }
			})
		})

		this.radioRow(group, 'selection', (row) => {
			row.createSpan({ text: 'Selection' })
			this.selectionCountEl = row.createSpan({ cls: 'ptl-pdf-import-hint' })
		})

		this.radioRow(group, 'custom', (row) => {
			row.createSpan({ text: 'Custom' })
			this.customInputEl = row.createEl('input', {
				type: 'text',
				cls: 'ptl-pdf-import-custom',
				placeholder: '1-3, 5, 8-10',
				value: this.state.custom,
			})
			this.customInputEl.addEventListener('focus', () => this.setMode('custom'))
			this.customInputEl.addEventListener('input', () => {
				this.state = { ...this.state, mode: 'custom', custom: this.customInputEl?.value ?? '' }
				this.refresh()
			})
		})
		this.customErrorEl = group.createDiv({ cls: 'ptl-pdf-import-error' })

		this.scaleSetting = new Setting(card).setName('Scale').setClass('ptl-pdf-import-scale')
		const scaleControl = this.scaleSetting.controlEl.createDiv({ cls: 'ptl-pdf-import-scale-input' })
		this.scaleInputEl = scaleControl.createEl('input', {
			type: 'number',
			value: `${this.state.scale}`,
			attr: { min: 5, max: 400, step: 5 },
		})
		scaleControl.createSpan({ text: '%' })
		this.scaleInputEl.addEventListener('input', () => {
			const value = Number(this.scaleInputEl?.value)
			if (!Number.isFinite(value) || value <= 0) return
			this.state = { ...this.state, scale: value }
			this.refresh()
		})
	}

	private radioRow(group: HTMLElement, mode: PageSelectionMode, build: (row: HTMLElement) => void) {
		const row = group.createEl('label', { cls: 'ptl-pdf-import-radio' })
		const radio = row.createEl('input', { type: 'radio', attr: { name: this.radioName, value: mode } })
		radio.addEventListener('change', () => this.setMode(mode))
		this.radioEls.set(mode, radio)
		build(row)
	}

	private numberInput(parent: HTMLElement, value: number, onChange: (value: number) => void) {
		const input = parent.createEl('input', {
			type: 'number',
			cls: 'ptl-pdf-import-page-input',
			value: `${value}`,
			attr: { min: 1, max: this.pageCount },
		})
		input.addEventListener('focus', () => this.setMode('range'))
		input.addEventListener('input', () => {
			const parsed = Math.round(Number(input.value))
			if (!Number.isFinite(parsed)) return
			onChange(Math.min(Math.max(parsed, 1), this.pageCount))
			this.refresh()
		})
		return input
	}

	private buildButtons(container: HTMLElement) {
		new ButtonComponent(container).setButtonText('Cancel').onClick(() => this.close())
		this.importButton = new ButtonComponent(container).setCta().onClick(() => {
			const pages = this.selectedPages()
			if (pages.length === 0) return
			this.onSubmit({ pages, scale: this.state.scale / 100 })
			this.close()
		})
	}

	// -------------------------------------------------------------------------

	private refresh() {
		const pages = this.selectedPages()
		const pageSet = new Set(pages)

		this.radioEls.forEach((radio, mode) => (radio.checked = mode === this.state.mode))

		this.thumbEls.forEach((thumb, page) => {
			const selected = pageSet.has(page)
			thumb.toggleClass('is-selected', selected)
			thumb.setAttr('aria-checked', selected)
		})

		if (this.selectionCountEl) {
			this.selectionCountEl.setText(
				this.state.mode === 'selection' ? `${pages.length} selected` : 'Click pages above'
			)
		}

		this.refreshCustomValidity()
		this.refreshScaleDescription(pages)

		this.importButton
			?.setButtonText(pages.length === 1 ? 'Import 1 page' : `Import ${pages.length} pages`)
			.setDisabled(pages.length === 0)
	}

	private refreshCustomValidity() {
		if (!this.customInputEl || !this.customErrorEl) return

		const showError = this.state.mode === 'custom' && this.state.custom.trim() !== ''
		const parsed = parsePageRanges(this.state.custom, this.pageCount)
		const error = showError && !parsed.ok ? parsed.error : ''

		this.customInputEl.toggleClass('ptl-invalid', error !== '')
		this.customErrorEl.setText(error)
	}

	private refreshScaleDescription(pages: number[]) {
		if (!this.scaleSetting) return

		const size = this.pageSizes.get(pages[0] ?? 1) ?? DEFAULT_PAGE_SIZE
		const scale = this.state.scale / 100
		const round = (n: number) => Math.round(n)
		this.scaleSetting.setDesc(
			`${round(size.width)} × ${round(size.height)} → ${round(size.width * scale)} × ${round(size.height * scale)}`
		)
	}
}
