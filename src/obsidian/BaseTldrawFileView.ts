import { FileView, Notice, TFile } from 'obsidian'
import { Root } from 'react-dom/client'
import InFrontOfTheCanvas from 'src/components/InFrontOfTheCanvas'
import {
	createRootAndRenderTldrawApp,
	TldrawAppProps,
	TldrawAppStoreProps,
} from 'src/components/TldrawApp'
import TldrawPlugin from 'src/main'
import { MARKDOWN_ICON_NAME, VIEW_TYPE_MARKDOWN } from 'src/utils/constants'
import { TLDataDocumentStore } from 'src/utils/document'
import { focusShape, parseShapeSubpath } from 'src/tldraw/links/shape-ref'
import { updateOutlinePanelState } from 'src/tldraw/outline/use-outline'
import { isShapeOrAncestorHidden } from 'src/tldraw/outline/visibility'
import { createDeepLinkString, Editor, parseDeepLinkString, TLDeepLink, TLShapeId } from 'tldraw'
import { getViewport } from 'src/utils/viewport-storage'
import { intercept, Interceptor, MethodKeys } from '../utils/decorators/methods'
import { exitFullscreen, isInFullscreenTarget, toggleFullscreen } from './fullscreen'
import TldrawAssetsModal from './modal/TldrawAssetsModal'

export interface DataUpdate {
	getData(): string
	saveFile(): Promise<void>
}

export function interceptFileViewMethod<
	TMethod extends MethodKeys<FileView>,
	TMethodArgs extends any[],
	TMethodReturn,
>(method: TMethod, interceptor: Interceptor<BaseTldrawFileView, FileView, TMethod, TMethodArgs, TMethodReturn>) {
	return intercept((instance: BaseTldrawFileView) => instance.fileView, method, interceptor)
}

/**
 * Implements overrides for {@linkcode FileView} by intercepting its methods.
 * We do this to mixin specific behavior into subclasses of FileView.
 *
 * #NOTE: may need to embed the react root in an iframe so that the right click context menus are positioned within the frame, and not partially hidden.
 */
export abstract class BaseTldrawFileView<View extends FileView = FileView> {
	abstract plugin: TldrawPlugin

	#reactRoot?: Root
	#onUnloadCallbacks: (() => void)[] = []

	#storeProps?: TldrawAppStoreProps
	#deepLink?: TLDeepLink
	#editor?: Editor
	#pendingShapeTarget?: TLShapeId

	#unregisterViewAssetsActionCallback?: () => void
	#unregisterOnWindowMigrated?: () => void

	messagesEl?: HTMLElement
	onMessagesClick?: (evt: MouseEvent) => void

	constructor(public fileView: View) {
		this.fileView.onload = this.onload.bind(this)
		this.fileView.onunload = this.onunload.bind(this)
		this.fileView.onLoadFile = this.onLoadFile.bind(this)
		this.fileView.onUnloadFile = this.onUnloadFile.bind(this)
		this.fileView.setEphemeralState = this.setEphemeralState.bind(this)
	}

	private getTldrawContainer() {
		return this.fileView.contentEl
	}

	protected abstract isReadOnly(): boolean
	/**
	 *
	 * @param update An object to manage the update.
	 */
	protected abstract onUpdated(update: DataUpdate): void

	// /**
	//  * Adds the entry point `tldraw-view-content` for the {@linkcode #reactRoot},
	//  * and the "View as markdown" action button.
	//  */
	// @interceptFileViewMethod('onload', function (this: BaseTldrawFileView, original, thisMethod) {
	// 	console.log('intercept onload', original, thisMethod)
	// 	return function (...args) {
	// 		console.log('intercepted onload', this.fileView, original, thisMethod)
	// 		original(...args)
	// 		thisMethod(...args)
	// 	}
	// })
	onload(): void {
		this.fileView.contentEl.addClass('tldraw-view-content')

		this.#unregisterOnWindowMigrated?.()
		this.#unregisterOnWindowMigrated = this.fileView.contentEl.onWindowMigrated(() => {
			this.refreshView()
		})

		this.fileView.addAction(MARKDOWN_ICON_NAME, 'View as markdown', () =>
			this.viewAsMarkdownClicked()
		)
		this.fileView.addAction('maximize', 'Toggle fullscreen', () =>
			toggleFullscreen(this.fileView.contentEl)
		)
		this.messagesEl = this.fileView.addAction('message-square', 'View messages', (evt) =>
			this.onMessagesClick?.(evt)
		)
	}

	// /**
	//  * Removes the previously added entry point `tldraw-view-content`, and unmounts {@linkcode #reactRoot}.
	//  */
	// @interceptFileViewMethod('onunload', (original, thisMethod) => {
	// 	return (...args) => {
	// 		original(...args)
	// 		thisMethod()
	// 	}
	// })
	onunload(): void {
		this.#unregisterOnWindowMigrated?.()
		// Closing the drawing while fullscreen would otherwise leave Obsidian's chrome hidden.
		if (isInFullscreenTarget(this.fileView.contentEl)) exitFullscreen(this.fileView.contentEl.ownerDocument)
		this.fileView.contentEl.removeClass('tldraw-view-content')
		this.unmountReactRoot()
	}

	// /**
	//  * Intercepts the {@linkcode FileView.onLoadFile} method to add the ability to load the file and initialize the store.
	//  * @returns
	//  */
	// @interceptFileViewMethod('onLoadFile', (original, thisMethod) => {
	// 	return async (...args) => {
	// 		await thisMethod(...args)
	// 		return original(...args)
	// 	}
	// })
	async onLoadFile(file: TFile): Promise<void> {
		const fileData = await this.fileView.app.vault.read(file)

		const storeInstance = this.plugin.tlDataDocumentStoreManager.register(
			file,
			() => fileData,
			(newFileData) => {
				// TODO: newFileData is currently a string, which means it was already converted to a string by the store instance.
				// We should probably pass an object with reference to the snapshot here instead of a string.
				// This way we can avoid an unnecessary conversion to a string if none of the methods below are called.
				this.onUpdated({
					getData: () => newFileData,
					saveFile: () => {
						// TODO: Check if the implementation is similar to TextFileView.save()
						return this.fileView.app.vault.modify(file, newFileData)
					},
				})
			},
			this.isReadOnly()
		)

		this.registerOnUnloadFile(() => storeInstance.unregister())

		const registration = this.plugin.instance.registerDocumentMessagesAction({
			key: storeInstance.getInstanceId(),
			actionEl: this.messagesEl!,
			messages: storeInstance.messages,
		})

		this.onMessagesClick = (evt) => {
			registration.onMessagesClicked(evt)
		}

		this.registerOnUnloadFile(() => {
			this.onMessagesClick = undefined
			registration.unregister()
		})

		const processedStore = await this.processStore(storeInstance.documentStore)

		if (!processedStore) {
			this.fileView.unload()
			return
		}

		this.setStore({
			plugin: processedStore,
		})
	}

	/**
	 * Processes the store and returns a new store or `null` if the store should be unloaded.
	 * @param documentStore
	 * @returns
	 */
	protected abstract processStore(
		documentStore: TLDataDocumentStore
	): Promise<TLDataDocumentStore | null>

	// @interceptFileViewMethod('onUnloadFile', (original, thisMethod) => {
	// 	return async (...args) => {
	// 		await thisMethod()
	// 		return original(...args)
	// 	}
	// })
	async onUnloadFile(): Promise<void> {
		const callbacks = [...this.#onUnloadCallbacks]
		this.#onUnloadCallbacks = []
		this.#editor = undefined
		callbacks.forEach((e) => e())
	}

	public registerOnUnloadFile(cb: () => void) {
		this.#onUnloadCallbacks.push(cb)
	}

	// @interceptFileViewMethod('setEphemeralState', (original, thisMethod) => {
	// 	return (...args) => {
	// 		original(...args)
	// 		thisMethod(...args)
	// 	}
	// })
	setEphemeralState(state: unknown): void {
		// `[[drawing#^shapeId]]` links: zoom to the shape now if the editor is up, otherwise once it mounts.
		const shapeId =
			typeof state === 'object' && state && 'subpath' in state && typeof state.subpath === 'string'
				? parseShapeSubpath(state.subpath)
				: undefined
		if (shapeId) {
			if (this.#editor) {
				this.#focusShape(this.#editor, shapeId)
				return
			}
			this.#pendingShapeTarget = shapeId
			return
		}

		// If a deep link is present when the document is opened, set the deeplink variable so the editor is opened at the deep link.
		if (
			typeof state === 'object' &&
			state &&
			'tldrawDeepLink' in state &&
			typeof state.tldrawDeepLink === 'string'
		) {
			const tldrawDeepLink = state.tldrawDeepLink
			try {
				this.#deepLink = parseDeepLinkString(tldrawDeepLink)
				return
			} catch (e) {
				console.error('Unable to parse deeplink:', tldrawDeepLink, e)
			}
		}
	}

	#focusShape(editor: Editor, id: TLShapeId) {
		if (!focusShape(editor, id)) {
			new Notice("That shape isn't in this drawing anymore.")
			return
		}
		// A hidden shape can't be seen on the canvas, so open the outline panel, where the
		// selection sync expands its parents and scrolls its row into view.
		if (isShapeOrAncestorHidden(editor, id)) updateOutlinePanelState(editor, { collapsed: false })
	}

	protected getTldrawOptions(): TldrawAppProps['options'] {
		const initialDeepLink = this.#deepLink
			? createDeepLinkString(this.#deepLink)
			: undefined

		const filePath = this.fileView.file?.path
		const vaultName = this.plugin.app.vault.getName()
		const hasSavedViewport = filePath
			? getViewport(vaultName, filePath) !== null
			: false

		return {
			components: {
				InFrontOfTheCanvas,
			},
			initialDeepLink,
			onEditorMount: (editor) => {
				this.#editor = editor
				const shapeTarget = this.#pendingShapeTarget
				this.#pendingShapeTarget = undefined
				if (shapeTarget) {
					this.#focusShape(editor, shapeTarget)
					return
				}
				if (!initialDeepLink && !hasSavedViewport) {
					editor.zoomToFit()
				}
			},
		}
	}

	private createReactRoot(entryPoint: Element, store: TldrawAppStoreProps) {
		return createRootAndRenderTldrawApp(entryPoint, this.plugin, {
			app: this.getTldrawOptions(),
			store,
			filePath: this.fileView.file?.path,
		})
	}

	/**
	 * Set the store props to be used inside the react root element.
	 * @param storeProps
	 * @returns
	 */
	private setStore(storeProps?: TldrawAppStoreProps) {
		this.#storeProps = storeProps
		this.updateViewAssetsAction()
		this.refreshView()
	}

	protected viewAsMarkdownClicked() {
		this.plugin.updateViewMode(VIEW_TYPE_MARKDOWN)
	}

	private updateViewAssetsAction() {
		const storeProps = this.#storeProps
		this.#unregisterViewAssetsActionCallback?.()
		if (!storeProps) return

		const viewAssetsAction = this.fileView.addAction('library', 'View assets', () => {
			const assetsModal = new TldrawAssetsModal(this.fileView.app, storeProps, this.fileView.file)
			assetsModal.open()
			this.registerOnUnloadFile(() => assetsModal.close())
		})

		const removeCb = () => {
			viewAssetsAction.remove()
		}
		this.registerOnUnloadFile(removeCb)
		this.#unregisterViewAssetsActionCallback = () => {
			this.#onUnloadCallbacks.remove(removeCb)
			removeCb()
		}
	}

	private unmountReactRoot() {
		this.#reactRoot?.unmount()
		this.#reactRoot = undefined
	}

	refreshView() {
		const storeProps = this.#storeProps
		this.unmountReactRoot()
		if (!storeProps) return
		this.#reactRoot = this.createReactRoot(this.getTldrawContainer(), storeProps)
	}
}
