import { BlockCache, CachedMetadata, parseLinktext, ReferenceCache, TFile } from 'obsidian'
import TldrawPlugin from 'src/main'
import { vaultFileToBlob } from 'src/obsidian/helpers/vault'
import { getRenderedPdfPage, pageFromSubpath } from 'src/obsidian/pdf/pdf-services'
import { TldrawFileListener } from 'src/obsidian/plugin/TldrawFileListenerMap'
import { LinkBlock, removeLinkBlocks } from 'src/utils/markdown-layout'
import { createAttachmentFilepath } from 'src/utils/utils'
import {
	DEFAULT_SUPPORTED_IMAGE_TYPES,
	TLAsset,
	TLAssetContext,
	TLAssetId,
	TLAssetStore,
	TLImageAsset,
} from 'tldraw'
import { insertLinkBlock } from 'src/utils/markdown-layout'
import { createImageAsset } from './helpers/create-asset'
import { isBlockRefPending, markBlockRefPending } from './pending-block-refs'
import { TldrawStoreIndexedDB } from './indexeddb-store'

const blockRefAssetPrefix = 'obsidian.blockref.'
export type BlockRefAssetId = `${typeof blockRefAssetPrefix}${string}`

interface ObsidianMarkdownFileTLAssetStoreProxyEvents {
	contents: {
		addedAsset(fileContents: string, assetId: BlockRefAssetId, assetFile: TFile): void
	}
	blockRef: {
		/**
		 *
		 * @param block The block that was used
		 * @param contents Contents that were removed
		 * @param newData The new file data
		 */
		removed(block: BlockCache, contents: string, newData: string): void
		resolveAsset: {
			loaded(block: BlockCache): void
			errorLoading(block: BlockCache, link: string, error: unknown): void
			notFound(ref: string): void
			notALink(block: BlockCache): void
			linkToUnknownFile(block: BlockCache, link: string): void
		}
	}
}

/**
 * Use a markdown file as an assets proxy for {@linkcode TLAssetStore}
 */
export class ObsidianMarkdownFileTLAssetStoreProxy {
	/**
	 * <block reference id, asset base64 URI string>
	 *
	 * We utilize a base64 data URI string here instead of a non-data URI because the TldrawImage component will display an image error without it.
	 */
	readonly #resolvedAssetDataCache = new Map<BlockRefAssetId, string>()
	readonly #metadataListener: TldrawFileListener

	#cachedMetadata: CachedMetadata | null

	static isBlockRefId(id: string): id is BlockRefAssetId {
		return id.startsWith(blockRefAssetPrefix)
	}

	static getBlockIdFromBlockRefId(blockRefId: BlockRefAssetId) {
		return blockRefId.slice(blockRefAssetPrefix.length)
	}

	constructor(
		private readonly plugin: TldrawPlugin,
		/**
		 * The markdown file
		 */
		private readonly tFile: TFile,
		private readonly events?: Partial<ObsidianMarkdownFileTLAssetStoreProxyEvents>
	) {
		this.#cachedMetadata = this.plugin.app.metadataCache.getFileCache(tFile)
		this.#metadataListener = this.plugin.tldrawFileMetadataListeners.addListener(tFile, () => {
			this.#cachedMetadata = this.plugin.app.metadataCache.getFileCache(tFile)
		})
	}

	dispose() {
		this.#metadataListener.remove()
		// We want to avoid memory leaks: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static#memory_management
		for (const objectURL of this.#resolvedAssetDataCache.values()) {
			URL.revokeObjectURL(objectURL)
		}
	}

	get cachedMetadata() {
		if (!this.#cachedMetadata) {
			throw new Error(
				`${ObsidianMarkdownFileTLAssetStoreProxy.name}: Cached metadata is unavailable for ${this.tFile.path}`
			)
		}
		return this.#cachedMetadata
	}

	/**
	 * Store an asset as a link in the markdown file
	 * @param file The asset file to store a reference to in the markdown file.
	 */
	async storeAsset(asset: TLAsset, file: File) {
		const blockRefId = window.crypto.randomUUID()
		const objectName = `${blockRefId}-${file.name}`.replace(/\W/g, '-')
		const ext = file.type.split('/').at(1)

		const { filename, folder } = await createAttachmentFilepath(
			this.plugin.app.fileManager,
			!ext ? objectName : `${objectName}.${ext}`,
			this.tFile
		)

		const assetFile = await this.plugin.app.vault.createBinary(
			`${folder}/${filename}`,
			await file.arrayBuffer()
		)

		const assetSrc = await this.createLinkWithBlockRef(assetFile, blockRefId)

		this.cacheAsset(assetSrc, file)

		return assetSrc
	}

	/**
	 * Persist the asset file as a link within the markdown file and attach a block reference to it.
	 * @param assetFile The file in the vault to link as an asset
	 * @param blockRefId The reference id for the asset.
	 * @param subpath Optional subpath including the leading `#`, e.g. `#page=3` or `#^block`.
	 * @returns
	 */
	async createLinkWithBlockRef(assetFile: TFile, blockRefId: string, subpath?: string) {
		if (this.cachedMetadata.blocks?.[blockRefId] !== undefined) {
			throw new Error('Block ref already exists')
		}
		const internalLink = this.plugin.app.fileManager.generateMarkdownLink(
			assetFile,
			this.tFile.path,
			subpath
		)
		const assetSrc = `${blockRefAssetPrefix}${blockRefId}` as const
		// Protect the line from being pruned by a save before its shape or asset exists.
		markBlockRefPending(blockRefId)
		await this.plugin.app.vault.process(this.tFile, (data) => {
			const contents = insertLinkBlock(data, { link: internalLink, id: blockRefId })
			this.events?.contents?.addedAsset(contents, assetSrc, assetFile)
			return contents
		})

		return assetSrc
	}

	async removeBlockRef(...blockRefAssetIds: BlockRefAssetId[]) {
		if (blockRefAssetIds.length === 0) return
		const ids = blockRefAssetIds.map((id) => ObsidianMarkdownFileTLAssetStoreProxy.getBlockIdFromBlockRefId(id))

		// Match link lines by their text: cached block offsets are stale after the file is
		// rewritten on save, and deleting by offset could cut into the drawing data.
		let removed: LinkBlock[] = []
		const newData = await this.plugin.app.vault.process(this.tFile, (data) => {
			const result = removeLinkBlocks(data, ids)
			removed = result.removed
			return result.text
		})

		for (const { id, link } of removed) {
			const block = this.#cachedMetadata?.blocks?.[id] ?? ({ id } as BlockCache)
			this.events?.blockRef?.removed(block, `${link}\n^${id}`, newData)
		}
	}

	/** Make an asset's data available before Obsidian has indexed its new link line. */
	primeCache(blockRefAssetId: BlockRefAssetId, blob: Blob) {
		const existing = this.#resolvedAssetDataCache.get(blockRefAssetId)
		if (existing) URL.revokeObjectURL(existing)
		this.cacheAsset(blockRefAssetId, blob)
	}

	private cacheAsset(assetSrc: BlockRefAssetId, blob: Blob) {
		const assetDataUri = URL.createObjectURL(blob)
		this.#resolvedAssetDataCache.set(assetSrc, assetDataUri)
		return assetDataUri
	}

	/**
	 * Find the link or embed that a block ref points at, and the vault file it resolves to.
	 * `subpath` includes the leading `#` (e.g. `#page=3`), or is '' when absent.
	 */
	resolveBlockRef(blockRefId: BlockRefAssetId) {
		const id = ObsidianMarkdownFileTLAssetStoreProxy.getBlockIdFromBlockRefId(blockRefId)
		const block = this.cachedMetadata.blocks?.[id]
		if (!block) {
			// A just-added line may not be indexed yet; that's not an error worth reporting.
			if (!isBlockRefPending(id)) this.events?.blockRef?.resolveAsset.notFound(id)
			return null
		}

		// Can either be a link or an embed since they both have a link property
		const reference: ReferenceCache | undefined =
			this.cachedMetadata.links?.find(
				(linkCache) => linkCache.position.start.offset === block.position.start.offset
			) ??
			this.cachedMetadata.embeds?.find(
				(embed) => embed.position.start.offset === block.position.start.offset
			)

		if (!reference) {
			this.events?.blockRef?.resolveAsset.notALink(block)
			return null
		}

		const { path, subpath } = parseLinktext(reference.link)
		const file = this.plugin.app.metadataCache.getFirstLinkpathDest(path, this.tFile.path)

		if (!file) {
			this.events?.blockRef?.resolveAsset.linkToUnknownFile(block, reference.link)
			return null
		}

		return { block, reference, file, subpath }
	}

	/**
	 * Store a link to a vault file (with optional subpath) as a block ref line, so Obsidian
	 * keeps it up to date when the target is renamed.
	 */
	async addLink(file: TFile, subpath?: string): Promise<BlockRefAssetId> {
		return this.createLinkWithBlockRef(file, window.crypto.randomUUID(), subpath)
	}

	/** Point an existing block ref line at a new target, keeping its block id. */
	async updateLink(blockRefId: BlockRefAssetId, file: TFile, subpath?: string) {
		const resolved = this.resolveBlockRef(blockRefId)
		if (!resolved) throw new Error(`Unknown block ref ${blockRefId}`)

		const { reference } = resolved
		const newLink = this.plugin.app.fileManager.generateMarkdownLink(file, this.tFile.path, subpath)

		await this.plugin.app.vault.process(this.tFile, (data) => {
			const { start, end } = reference.position
			const current = data.slice(start.offset, end.offset)
			if (current !== reference.original) {
				throw new Error('Unable to update link: the file changed since it was indexed')
			}
			return `${data.slice(0, start.offset)}${newLink}${data.slice(end.offset)}`
		})
	}

	async getAsset(blockRefAssetId: BlockRefAssetId): Promise<Blob | null> {
		const resolved = this.resolveBlockRef(blockRefAssetId)
		if (!resolved) return null

		const { block: assetBlock, reference: blockRef, file: assetFile, subpath } = resolved

		// PDF links render the linked page instead of loading the file itself.
		const blob =
			assetFile.extension === 'pdf'
				? getRenderedPdfPage(this.plugin.app, assetFile, pageFromSubpath(subpath)).then(
						(page) => page.blob
					)
				: vaultFileToBlob(assetFile)

		return blob
			.then((blob) => {
				this.events?.blockRef?.resolveAsset.loaded(assetBlock)
				return blob
			})
			.catch((error) => {
				this.events?.blockRef?.resolveAsset.errorLoading(assetBlock, blockRef.link, error)
				throw new Error('Unable to load file from vault')
			})
	}

	/**
	 * Get the asset from the cache, or read it and cache it if the asset exists
	 * @param blockRefAssetId
	 */
	async getCached(blockRefAssetId: BlockRefAssetId) {
		const cachedAsset = this.#resolvedAssetDataCache.get(blockRefAssetId)
		if (cachedAsset) return cachedAsset
		const assetData = await this.getAsset(blockRefAssetId)
		if (!assetData) return null
		return this.cacheAsset(blockRefAssetId, assetData)
	}

	async getAll(): Promise<BlockRefAssetId[]> {
		return Object.values(this.cachedMetadata.blocks ?? {}).map(
			(e) => `${blockRefAssetPrefix}${e.id}` as const
		)
	}

	async createImageAsset(
		assetFile: TFile,
		{
			blockRefId = window.crypto.randomUUID(),
			immediatelyCache = false,
		}: {
			blockRefId?: string
			/**
			 * Setting to `true` will essentially make the asset data available without having to refer to the link referenced by a block ref.
			 * Skips having to read the file metadata to locate the asset with via the block ref.
			 *
			 * @default false
			 */
			immediatelyCache?: boolean
		} = {}
	): Promise<TLImageAsset> {
		const assetBlob = await vaultFileToBlob(assetFile)

		if (!(DEFAULT_SUPPORTED_IMAGE_TYPES as readonly string[]).includes(assetBlob.type)) {
			throw new Error(`Expected an image mime-type, got ${assetBlob.type}`, {
				cause: {
					message: 'The provided file is not an image type.',
					assetFile,
					type: assetBlob.type,
				},
			})
		}

		if (!(DEFAULT_SUPPORTED_IMAGE_TYPES as readonly string[]).includes(assetBlob.type)) {
			throw new Error(`Expected an image mime-type, got ${assetBlob.type}`, {
				cause: {
					message: 'The provided file is not an image type.',
					assetFile,
					type: assetBlob.type,
				},
			})
		}

		const assetSrc = await this.createLinkWithBlockRef(assetFile, blockRefId)

		/**
		 * Should be revoked if not added to the cache.
		 */
		const assetUri = immediatelyCache
			? this.cacheAsset(assetSrc, assetBlob)
			: URL.createObjectURL(assetBlob)

		try {
			const { width, height } = await (async () => {
				const image = new Image()
				image.src = assetUri
				await image.decode()
				return image
			})()

			return createImageAsset({
				props: {
					isAnimated: false,
					fileSize: assetBlob.size,
					mimeType: assetBlob.type,
					name: assetFile.name,
					src: `asset:${assetSrc}`,
					w: width,
					h: height,
				},
			})
		} finally {
			if (!immediatelyCache) {
				// We only needed the object url for getting the width and height.
				URL.revokeObjectURL(assetUri)
			}
		}
	}
}

/**
 * Prohibits modifications to the markdown file.
 */
export class ObsidianReadOnlyMarkdownFileTLAssetStoreProxy extends ObsidianMarkdownFileTLAssetStoreProxy {
	storeAsset(): Promise<never> {
		throw new Error(
			`${ObsidianReadOnlyMarkdownFileTLAssetStoreProxy.name}: Storing assets is prohibited in read-only mode.`
		)
	}
}

/**
 * Replaces the default tldraw asset store with one that saves assets to the attachment folder.
 *
 * See more:
 *
 * https://tldraw.dev/examples/data/assets/hosted-images
 */
export class ObsidianTLAssetStore implements TLAssetStore {
	private db?: null | TldrawStoreIndexedDB
	private readonly resolvedIDBCache = new Map<string, string>()

	constructor(
		/**
		 * The persistence key which references a {@linkcode TLAssetStore} in the {@linkcode IDBDatabase}
		 */
		public readonly persistenceKey: string,
		public readonly proxy: ObsidianMarkdownFileTLAssetStoreProxy
	) {
		this.upload = this.upload.bind(this)
		this.resolve = this.resolve.bind(this)
	}

	dispose() {
		this.proxy.dispose()
		// We want to avoid memory leaks: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static#memory_management
		for (const objectURL of this.resolvedIDBCache.values()) {
			URL.revokeObjectURL(objectURL)
		}
	}

	async upload(asset: TLAsset, file: File, _: AbortSignal): ReturnType<TLAssetStore['upload']> {
		const blockRefAssetId = await this.proxy.storeAsset(asset, file)
		return {
			src: `asset:${blockRefAssetId}`,
		}
	}

	async resolve(asset: TLAsset, _: TLAssetContext): Promise<null | string> {
		const assetSrc = asset.props.src
		if (!assetSrc) return null

		if (!assetSrc.startsWith('asset:')) return assetSrc

		const assetId = assetSrc.split(':').at(1)

		if (!assetId) return null

		if (!ObsidianMarkdownFileTLAssetStoreProxy.isBlockRefId(assetId)) {
			return this.getFromIndexedDB(assetSrc as `asset:${string}`)
		}

		return this.proxy.getCached(assetId)
	}

	remove(_: TLAssetId[]): Promise<void> {
		// TODO: Implement this. For now, we just log a warning and return a resolved promise.
		console.warn(`${ObsidianTLAssetStore.name}.remove: Not implemented yet.`)
		return Promise.resolve()
	}

	async getFromMarkdown(assetSrc: BlockRefAssetId) {
		return this.proxy.getCached(assetSrc)
	}

	async tryOpenDb() {
		if (this.db === null) {
			// Already tried
			return null
		}
		return (this.db = await TldrawStoreIndexedDB.open(this.persistenceKey))
	}

	async getFromIndexedDB(assetSrc: `asset:${string}`): Promise<string | null> {
		const cachedAssetUri = this.resolvedIDBCache.get(assetSrc)
		if (cachedAssetUri) return cachedAssetUri
		const db = await this.tryOpenDb()
		if (!db) return null
		const blob = await db.getAsset(assetSrc)
		if (!blob) return null
		const assetUri = URL.createObjectURL(blob)
		this.resolvedIDBCache.set(assetSrc, assetUri)
		return assetUri
	}

	async getAllFromIndexedDB(): Promise<`asset:${string}`[]> {
		const db = await this.tryOpenDb()
		if (!db) return []
		await db.openDb()
		return db.getAllAssetSources()
	}

	async getAllFromMarkdownFile(): Promise<BlockRefAssetId[]> {
		return this.proxy.getAll()
	}
}
