import { $, browser, expect } from '@wdio/globals'

const SHAPE_ID = 'shape:outline-e2e'

/**
 * The outline panel drives the editor from outside the canvas (selection, meta.name, meta.hidden,
 * the canvas context menu), so these check each round trip through the real Obsidian view.
 */
describe('Outline panel', () => {
	before(async () => {
		await browser.reloadObsidian({
			plugins: ['tldraw'],
		})

		await browser.executeObsidian(async ({ app }, shapeId) => {
			const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
			const plugin = (app as unknown as { plugins: { plugins: Record<string, any> } }).plugins
				.plugins.tldraw
			// Otherwise creating a drawing opens the destination picker and blocks the test.
			plugin.settings.fileDestinations.confirmDestination = false
			const file = await plugin.createUntitledTldrFile({})
			await plugin.openTldrFile(file, 'new-tab')

			const deadline = Date.now() + 15_000
			while (!plugin.currTldrawEditor && Date.now() < deadline) await sleep(100)
			const editor = plugin.currTldrawEditor
			if (!editor) throw new Error('The tldraw editor never mounted.')

			editor.createShape({
				id: shapeId,
				type: 'geo',
				x: 100,
				y: 100,
				props: { geo: 'rectangle', w: 120, h: 80 },
			})
			editor.selectNone()
		}, SHAPE_ID)
	})

	after(async () => {
		await browser.executeObsidian(async ({ app }) => {
			const file = app.workspace.getActiveFile()
			if (file) await app.vault.delete(file)
		})
	})

	const readShape = () =>
		browser.executeObsidian(({ app }, shapeId) => {
			const plugin = (app as unknown as { plugins: { plugins: Record<string, any> } }).plugins
				.plugins.tldraw
			const editor = plugin.currTldrawEditor
			const shape = editor?.getShape(shapeId)
			return {
				name: shape?.meta.name as string | undefined,
				hidden: shape?.meta.hidden as boolean | undefined,
				selected: (editor?.getSelectedShapeIds() ?? []) as string[],
			}
		}, SHAPE_ID)

	const row = () => $(`.ptl-outline-layers [data-shape-id="${SHAPE_ID}"]`)

	it('expands from the collapsed pill', async () => {
		await $('.ptl-outline--pill [aria-label="Show layers"]').click()
		await expect($('.ptl-outline--expanded')).toBeExisting()
		await expect(row()).toBeExisting()
	})

	it('selects a shape by clicking its row', async () => {
		await row().click()
		expect((await readShape()).selected).toEqual([SHAPE_ID])
	})

	it('renames the selected row with space', async () => {
		await browser.keys(' ')
		const input = $('.ptl-outline-rename')
		await input.waitForExist({ timeout: 5000 })
		await input.setValue('hero box')
		await browser.keys('Enter')

		await expect(row()).toHaveText('hero box')
		expect((await readShape()).name).toBe('hero box')
	})

	it('hides and shows from the eye toggle', async () => {
		await row().moveTo()
		await row().$('[aria-label="Hide"]').click()
		expect((await readShape()).hidden).toBe(true)

		await row().$('[aria-label="Show"]').click()
		expect((await readShape()).hidden).toBe(false)
	})

	it('opens the canvas context menu on right-click', async () => {
		await row().click({ button: 'right' })
		await expect($('[data-testid="context-menu"]')).toBeExisting()
		await browser.keys('Escape')
	})
})
