// IndexedDB cache of rendered PDF pages, so reopening a drawing doesn't re-render every page.
// Entries are keyed on the file's path, modification time, page and render scale, so an
// edited PDF or a changed quality setting simply misses the cache.

const DB_NAME = 'ptl-pdf-page-cache'
const STORE = 'pages'

export interface PdfPageCacheKey {
	path: string
	mtime: number
	page: number
	scale: number
}

export interface CachedPdfPage {
	blob: Blob
	width: number
	height: number
	pageWidth: number
	pageHeight: number
	/** Epoch ms of the last read, for pruning. */
	accessedAt: number
}

function keyString({ path, mtime, page, scale }: PdfPageCacheKey) {
	return `${path}#page=${page}#mtime=${mtime}#scale=${scale}`
}

function requestToPromise<T>(request: IDBRequest<T>) {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

export class PdfPageCache {
	private db?: Promise<IDBDatabase | null>

	private open() {
		this.db ??= new Promise<IDBDatabase | null>((resolve) => {
			try {
				const request = indexedDB.open(DB_NAME, 1)
				request.onupgradeneeded = () => request.result.createObjectStore(STORE)
				request.onsuccess = () => resolve(request.result)
				// The cache is an optimisation; without IndexedDB pages are just rendered each time.
				request.onerror = () => resolve(null)
			} catch {
				resolve(null)
			}
		})
		return this.db
	}

	async get(key: PdfPageCacheKey): Promise<CachedPdfPage | undefined> {
		const db = await this.open()
		if (!db) return undefined
		try {
			const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
			const id = keyString(key)
			const entry = await requestToPromise<CachedPdfPage | undefined>(store.get(id))
			if (!entry) return undefined
			store.put({ ...entry, accessedAt: Date.now() }, id)
			return entry
		} catch {
			return undefined
		}
	}

	async put(key: PdfPageCacheKey, page: Omit<CachedPdfPage, 'accessedAt'>) {
		const db = await this.open()
		if (!db) return
		try {
			const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
			await requestToPromise(store.put({ ...page, accessedAt: Date.now() }, keyString(key)))
		} catch (error) {
			console.warn('Unable to cache rendered PDF page', error)
		}
	}

	/** Remove entries not read in `maxAgeMs`. */
	async prune(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
		const db = await this.open()
		if (!db) return
		const cutoff = Date.now() - maxAgeMs
		const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
		const request = store.openCursor()
		request.onsuccess = () => {
			const cursor = request.result
			if (!cursor) return
			if ((cursor.value as CachedPdfPage).accessedAt < cutoff) cursor.delete()
			cursor.continue()
		}
	}

	dispose() {
		void this.db?.then((db) => db?.close())
		this.db = undefined
	}
}
