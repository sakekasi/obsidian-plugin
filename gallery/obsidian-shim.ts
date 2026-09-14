// Minimal browser stand-in for the parts of the `obsidian` API that gallery stories touch.
// Aliased as `obsidian` in gallery/vite.config.mts. Keep it small: add pieces only when a
// story needs them, and match Obsidian's DOM structure/class names so plugin CSS applies.

type DomElementInfo = {
	cls?: string | string[]
	text?: string
	attr?: Record<string, string | number | boolean>
	title?: string
	type?: string
	value?: string
	placeholder?: string
}

function applyInfo(el: HTMLElement, info?: DomElementInfo | string) {
	if (!info) return
	if (typeof info === 'string') {
		el.className = info
		return
	}
	if (info.cls) el.classList.add(...(Array.isArray(info.cls) ? info.cls : info.cls.split(' ')).filter(Boolean))
	if (info.text !== undefined) el.textContent = info.text
	if (info.title) el.title = info.title
	if (info.type) el.setAttribute('type', info.type)
	if (info.value !== undefined) (el as HTMLInputElement).value = info.value
	if (info.placeholder) el.setAttribute('placeholder', info.placeholder)
	Object.entries(info.attr ?? {}).forEach(([k, v]) => el.setAttribute(k, String(v)))
}

function createElHelper<K extends keyof HTMLElementTagNameMap>(
	parent: Node | undefined,
	tag: K,
	info?: DomElementInfo | string,
	callback?: (el: HTMLElementTagNameMap[K]) => void
) {
	const el = document.createElement(tag)
	applyInfo(el, info)
	parent?.appendChild(el)
	callback?.(el)
	return el
}

function installDomHelpers() {
	const proto = Node.prototype as any
	if (proto.createEl) return

	proto.createEl = function (tag: any, info?: any, cb?: any) {
		return createElHelper(this, tag, info, cb)
	}
	proto.createDiv = function (info?: any, cb?: any) {
		return createElHelper(this, 'div', info, cb)
	}
	proto.createSpan = function (info?: any, cb?: any) {
		return createElHelper(this, 'span', info, cb)
	}
	proto.empty = function () {
		while (this.firstChild) this.removeChild(this.firstChild)
	}
	proto.setText = function (text: string) {
		this.textContent = text
	}

	const elProto = HTMLElement.prototype as any
	elProto.addClass = function (...cls: string[]) {
		this.classList.add(...cls)
	}
	elProto.removeClass = function (...cls: string[]) {
		this.classList.remove(...cls)
	}
	elProto.toggleClass = function (cls: string, value: boolean) {
		this.classList.toggle(cls, value)
	}
	elProto.hasClass = function (cls: string) {
		return this.classList.contains(cls)
	}
	elProto.setAttr = function (name: string, value: string | number | boolean | null) {
		if (value === null) return this.removeAttribute(name)
		this.setAttribute(name, String(value))
	}
	elProto.show = function () {
		this.style.display = ''
	}
	elProto.hide = function () {
		this.style.display = 'none'
	}

	const g = globalThis as any
	g.createEl = (tag: any, info?: any, cb?: any) => createElHelper(undefined, tag, info, cb)
	g.createDiv = (info?: any, cb?: any) => createElHelper(undefined, 'div', info, cb)
	g.createSpan = (info?: any, cb?: any) => createElHelper(undefined, 'span', info, cb)
	g.createFragment = (cb?: (f: DocumentFragment) => void) => {
		const f = document.createDocumentFragment()
		cb?.(f)
		return f
	}
}

installDomHelpers()

// ---------------------------------------------------------------------------
// Icons (a few Lucide paths, which is what Obsidian ships)

const ICONS: Record<string, string> = {
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	'external-link':
		'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
	link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
	'file-text':
		'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
	'chevron-up': '<path d="m18 15-6-6-6 6"/>',
	'chevron-down': '<path d="m6 9 6 6 6-6"/>',
}

export function getIcon(iconId: string): SVGSVGElement | null {
	const body = ICONS[iconId]
	if (!body) return null
	const wrapper = document.createElement('div')
	wrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-${iconId}">${body}</svg>`
	return wrapper.firstElementChild as SVGSVGElement
}

export function setIcon(parent: HTMLElement, iconId: string) {
	parent.replaceChildren()
	const icon = getIcon(iconId)
	if (icon) parent.appendChild(icon)
}

// ---------------------------------------------------------------------------
// Misc

export class App {}
export class TFile {
	constructor(
		public path: string,
		public basename = path.split('/').pop()!.replace(/\.[^.]+$/, ''),
		public extension = path.split('.').pop() ?? ''
	) {}
}

export class Notice {
	constructor(message: string) {
		console.info('[Notice]', message)
	}
}

export interface SearchResult {
	score: number
	matches: [number, number][]
}

/** Subsequence matcher approximating Obsidian's fuzzy search. Higher score is better. */
export function prepareFuzzySearch(query: string): (text: string) => SearchResult | null {
	const q = query.toLowerCase()
	return (text: string) => {
		const t = text.toLowerCase()
		const matches: [number, number][] = []
		let ti = 0
		for (const ch of q) {
			const found = t.indexOf(ch, ti)
			if (found === -1) return null
			const last = matches[matches.length - 1]
			if (last && last[1] === found) last[1] = found + 1
			else matches.push([found, found + 1])
			ti = found + 1
		}
		const gaps = matches.length
		return { score: -gaps - t.length / 100, matches }
	}
}

// ---------------------------------------------------------------------------
// Components

export class BaseComponent {
	disabled = false
	setDisabled(disabled: boolean) {
		this.disabled = disabled
		return this
	}
}

abstract class ValueComponent<T> extends BaseComponent {
	protected changeCallbacks: ((value: T) => unknown)[] = []
	abstract getValue(): T
	abstract setValue(value: T): this
	onChange(cb: (value: T) => unknown) {
		this.changeCallbacks.push(cb)
		return this
	}
	protected emit() {
		this.changeCallbacks.forEach((cb) => cb(this.getValue()))
	}
}

export class TextComponent extends ValueComponent<string> {
	inputEl: HTMLInputElement
	constructor(containerEl: HTMLElement) {
		super()
		this.inputEl = createElHelper(containerEl, 'input', { type: 'text' })
		this.inputEl.addEventListener('input', () => this.emit())
	}
	getValue() {
		return this.inputEl.value
	}
	setValue(value: string) {
		this.inputEl.value = value
		return this
	}
	setPlaceholder(placeholder: string) {
		this.inputEl.placeholder = placeholder
		return this
	}
	setDisabled(disabled: boolean) {
		this.inputEl.disabled = disabled
		return super.setDisabled(disabled)
	}
}

export class ToggleComponent extends ValueComponent<boolean> {
	toggleEl: HTMLElement
	private value = false
	constructor(containerEl: HTMLElement) {
		super()
		this.toggleEl = createElHelper(containerEl, 'div', { cls: 'checkbox-container' })
		createElHelper(this.toggleEl, 'input', { type: 'checkbox' })
		this.toggleEl.addEventListener('click', () => {
			if (this.disabled) return
			this.setValue(!this.value)
			this.emit()
		})
	}
	getValue() {
		return this.value
	}
	setValue(on: boolean) {
		this.value = on
		this.toggleEl.classList.toggle('is-enabled', on)
		return this
	}
}

export class SliderComponent extends ValueComponent<number> {
	sliderEl: HTMLInputElement
	constructor(containerEl: HTMLElement) {
		super()
		this.sliderEl = createElHelper(containerEl, 'input', { type: 'range', cls: 'slider' })
		this.sliderEl.addEventListener('input', () => this.emit())
	}
	setLimits(min: number | null, max: number | null, step: number | 'any') {
		if (min !== null) this.sliderEl.min = String(min)
		if (max !== null) this.sliderEl.max = String(max)
		this.sliderEl.step = String(step)
		return this
	}
	getValue() {
		return Number(this.sliderEl.value)
	}
	setValue(value: number) {
		this.sliderEl.value = String(value)
		return this
	}
	setDynamicTooltip() {
		return this
	}
}

export class DropdownComponent extends ValueComponent<string> {
	selectEl: HTMLSelectElement
	constructor(containerEl: HTMLElement) {
		super()
		this.selectEl = createElHelper(containerEl, 'select', { cls: 'dropdown' })
		this.selectEl.addEventListener('change', () => this.emit())
	}
	addOption(value: string, display: string) {
		createElHelper(this.selectEl, 'option', { value, text: display })
		return this
	}
	addOptions(options: Record<string, string>) {
		Object.entries(options).forEach(([v, d]) => this.addOption(v, d))
		return this
	}
	getValue() {
		return this.selectEl.value
	}
	setValue(value: string) {
		this.selectEl.value = value
		return this
	}
}

export class ButtonComponent extends BaseComponent {
	buttonEl: HTMLButtonElement
	constructor(containerEl: HTMLElement) {
		super()
		this.buttonEl = createElHelper(containerEl, 'button')
	}
	setButtonText(name: string) {
		this.buttonEl.textContent = name
		return this
	}
	setIcon(icon: string) {
		setIcon(this.buttonEl, icon)
		return this
	}
	setCta() {
		this.buttonEl.classList.add('mod-cta')
		return this
	}
	setWarning() {
		this.buttonEl.classList.add('mod-warning')
		return this
	}
	setTooltip(tooltip: string) {
		this.buttonEl.setAttribute('aria-label', tooltip)
		return this
	}
	setDisabled(disabled: boolean) {
		this.buttonEl.disabled = disabled
		return super.setDisabled(disabled)
	}
	onClick(cb: (evt: MouseEvent) => unknown) {
		this.buttonEl.addEventListener('click', cb)
		return this
	}
}

export class ExtraButtonComponent extends BaseComponent {
	extraSettingsEl: HTMLElement
	constructor(containerEl: HTMLElement) {
		super()
		this.extraSettingsEl = createElHelper(containerEl, 'div', { cls: 'clickable-icon extra-setting-button' })
	}
	setIcon(icon: string) {
		setIcon(this.extraSettingsEl, icon)
		return this
	}
	setTooltip(tooltip: string) {
		this.extraSettingsEl.setAttribute('aria-label', tooltip)
		return this
	}
	onClick(cb: () => unknown) {
		this.extraSettingsEl.addEventListener('click', cb)
		return this
	}
}

export class Setting {
	settingEl: HTMLElement
	infoEl: HTMLElement
	nameEl: HTMLElement
	descEl: HTMLElement
	controlEl: HTMLElement
	components: BaseComponent[] = []

	constructor(containerEl: HTMLElement) {
		this.settingEl = createElHelper(containerEl, 'div', { cls: 'setting-item' })
		this.infoEl = createElHelper(this.settingEl, 'div', { cls: 'setting-item-info' })
		this.nameEl = createElHelper(this.infoEl, 'div', { cls: 'setting-item-name' })
		this.descEl = createElHelper(this.infoEl, 'div', { cls: 'setting-item-description' })
		this.controlEl = createElHelper(this.settingEl, 'div', { cls: 'setting-item-control' })
	}

	setName(name: string | DocumentFragment) {
		this.nameEl.replaceChildren(name)
		return this
	}
	setDesc(desc: string | DocumentFragment) {
		this.descEl.replaceChildren(desc)
		return this
	}
	setClass(cls: string) {
		this.settingEl.classList.add(cls)
		return this
	}
	setHeading() {
		this.settingEl.classList.add('setting-item-heading')
		return this
	}
	setDisabled(disabled: boolean) {
		this.settingEl.classList.toggle('is-disabled', disabled)
		this.components.forEach((c) => c.setDisabled(disabled))
		return this
	}

	private add<C extends BaseComponent>(component: C, cb: (c: C) => unknown) {
		this.components.push(component)
		cb(component)
		return this
	}
	addText(cb: (c: TextComponent) => unknown) {
		return this.add(new TextComponent(this.controlEl), cb)
	}
	addToggle(cb: (c: ToggleComponent) => unknown) {
		return this.add(new ToggleComponent(this.controlEl), cb)
	}
	addSlider(cb: (c: SliderComponent) => unknown) {
		return this.add(new SliderComponent(this.controlEl), cb)
	}
	addDropdown(cb: (c: DropdownComponent) => unknown) {
		return this.add(new DropdownComponent(this.controlEl), cb)
	}
	addButton(cb: (c: ButtonComponent) => unknown) {
		return this.add(new ButtonComponent(this.controlEl), cb)
	}
	addExtraButton(cb: (c: ExtraButtonComponent) => unknown) {
		return this.add(new ExtraButtonComponent(this.controlEl), cb)
	}
}

export class Modal {
	app: App
	containerEl: HTMLElement
	modalEl: HTMLElement
	titleEl: HTMLElement
	contentEl: HTMLElement
	private closeCallback?: () => unknown

	constructor(app: App) {
		this.app = app
		this.containerEl = createElHelper(undefined, 'div', { cls: 'modal-container mod-dim' })
		createElHelper(this.containerEl, 'div', { cls: 'modal-bg' }, (bg) =>
			bg.addEventListener('click', () => this.close())
		)
		this.modalEl = createElHelper(this.containerEl, 'div', { cls: 'modal' })
		createElHelper(this.modalEl, 'div', { cls: 'modal-close-button' }, (btn) => {
			setIcon(btn, 'x')
			btn.addEventListener('click', () => this.close())
		})
		const header = createElHelper(this.modalEl, 'div', { cls: 'modal-header' })
		this.titleEl = createElHelper(header, 'div', { cls: 'modal-title' })
		this.contentEl = createElHelper(this.modalEl, 'div', { cls: 'modal-content' })
	}

	open() {
		document.body.appendChild(this.containerEl)
		this.onOpen()
	}

	/**
	 * Gallery-only (not part of Obsidian's API): render the modal inline inside `parent`
	 * so several states can be inspected side by side.
	 */
	openInline(parent: HTMLElement) {
		this.containerEl.classList.add('gallery-inline-modal')
		parent.appendChild(this.containerEl)
		this.onOpen()
	}

	close() {
		if (!this.containerEl.isConnected) return
		this.containerEl.remove()
		this.onClose()
		this.closeCallback?.()
	}

	onOpen(): Promise<void> | void {}
	onClose() {}

	setTitle(title: string) {
		this.titleEl.textContent = title
		return this
	}
	setContent(content: string | DocumentFragment) {
		this.contentEl.replaceChildren(content)
		return this
	}
	setCloseCallback(cb: () => unknown) {
		this.closeCallback = cb
		return this
	}
}
