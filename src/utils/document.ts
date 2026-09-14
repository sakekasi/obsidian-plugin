import { PluginManifest } from 'obsidian'
import { isValidFrontmatterTag } from 'src/obsidian/helpers/front-matter'
import { JsonObject, SerializedStore, TldrawFile, TLRecord, TLStore } from 'tldraw'
import { isBlockRefPending } from 'src/tldraw/pending-block-refs'
import { TLDATA_DELIMITER_END, TLDATA_DELIMITER_START } from './constants'
import { collectBlockRefIds, layoutTldrawMarkdown, rebuildTldrawMarkdown } from './markdown-layout'
import { createRawTldrawFile } from './tldraw-file'
import { tldrawFileToJson } from './tldraw-file/tldraw-file-to-json'

export type TldrawPluginMetaData = {
	'plugin-version': string
	'tldraw-version': string
	/**
	 * Should be different for each drawing in the vault.
	 */
	uuid: string
}

export type TldrawDocumentOverrides = {
	isDarkMode: boolean
}

export type TLDataMaybeSerializedStore<T = unknown> = T &
	(
		| {
				raw: SerializedStore<TLRecord>
				store?: undefined
		  }
		| {
				store: TLStore
				raw?: undefined
		  }
	)

export type TLExistingDataDocument = TLDataMaybeSerializedStore<{
	meta: TldrawPluginMetaData
}>

export type TLDataDocument =
	| TLExistingDataDocument
	| {
			meta: TldrawPluginMetaData
			store?: undefined
			raw?: undefined
	  }

export type TLDataDocumentStore = {
	meta: TldrawPluginMetaData
	store: TLStore
}

export type TLData = {
	meta: TldrawPluginMetaData
	raw: JsonObject
}

export const getTLMetaTemplate = (
	pluginVersion: string,
	uuid: string = window.crypto.randomUUID()
) => ({
	uuid,
	'plugin-version': pluginVersion,
	'tldraw-version': TLDRAW_VERSION,
})

export const getTLDataTemplate = (
	pluginVersion: string,
	tldrawFile: TldrawFile,
	uuid: string
): TLData => ({
	meta: getTLMetaTemplate(pluginVersion, uuid),
	raw: tldrawFileToJson(tldrawFile),
})

export const frontmatterTemplate = (data: string, tags: string[]) => {
	const validTags = tags.filter((e) => {
		if (isValidFrontmatterTag(e)) {
			return true
		}
		console.warn(
			`Tag ${e} is not a valid frontmatter tag. Not adding to frontmatter.` +
				`\tSee https://help.obsidian.md/tags#Tag+format for more information.`
		)
		return false
	})
	let str = ''
	str += '---\n'
	str += `${data}\n`
	if (validTags.length) {
		str += `tags:\n`
		str += validTags.map((e) => `  - ${e}`).join('\n')
		str += '\n'
	}
	str += '---\n'
	return str
}

export const codeBlockTemplate = (data: TLData) => {
	let str = ''
	str += '```json' + ` ${TLDATA_DELIMITER_START}`
	str += '\n'
	str += `${JSON.stringify(data, null, '\t')}\n`
	str += `${TLDATA_DELIMITER_END}\n`
	str += '```'
	return str
}

export const tlFileTemplate = (frontmatter: string, codeblock: string) =>
	layoutTldrawMarkdown({ frontmatter, blocks: [], codeblock })

/**
 *
 * @param manifest
 * @param data Data to update
 * @param documentStore Will be serialized to update the data.
 * @returns
 */
export async function updateFileData(
	manifest: PluginManifest,
	data: string,
	documentStore: TLDataDocumentStore
) {
	const tldrawData = getTLDataTemplate(
		manifest.version,
		createRawTldrawFile(documentStore.store),
		documentStore.meta.uuid
	)

	// Rewrites the file into the sectioned layout on every save, which also migrates older
	// files and prunes link lines that no shape or asset references anymore.
	const usedBlockRefIds = collectBlockRefIds(documentStore.store.allRecords())
	return rebuildTldrawMarkdown(
		data,
		codeBlockTemplate(tldrawData),
		(id) => usedBlockRefIds.has(id) || isBlockRefPending(id)
	)
}

export function makeFileDataTldr(documentStore: TLDataDocumentStore) {
	const tldrFile = createRawTldrawFile(documentStore.store)
	return JSON.stringify(tldrawFileToJson(tldrFile))
}
