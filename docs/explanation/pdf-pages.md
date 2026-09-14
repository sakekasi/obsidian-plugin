# How adding PDF pages works

PDF pages go on the canvas as images that stay linked to the PDF they came from. This page
walks through what happens from the moment you add a PDF to the moment its pages are drawn,
and why it's built that way. For the exact fields stored in the drawing, see
[the file format reference](../reference/file-format.md#pdf-pages).

## 1. Getting a PDF onto the canvas

There are three ways in:

| You… | What happens |
| --- | --- |
| Drag a PDF from Obsidian's file explorer | The drop is caught before tldraw or Obsidian handle it, and the file is used as-is. |
| Drag a PDF from Finder or another app | The PDF is copied into your attachments folder first, then used from there. |
| Run **Insert PDF pages…** | Pick a PDF from the vault; pages go in at the center of the view. |

Dragged files that aren't PDFs keep tldraw's usual handling.

Drags from the file explorer don't carry the file itself, only a note in Obsidian's drag
manager saying which file is being dragged. That's why they need their own drop listener;
files from outside Obsidian arrive through tldraw's normal file handling.

## 2. Choosing pages

The import dialog is modelled on the macOS print dialog.[^dialog] A row of thumbnails runs
along the top, and clicking one toggles that page. Below it:

- **Pages**: all, a from–to range, the pages clicked above, or a custom list like `1-3, 5`.
  The thumbnails and these options stay in sync.
- **Scale**: how large pages appear on the canvas relative to their size in points. It
  defaults to 30%.

Thumbnails are rendered only as they scroll into view, so long PDFs open quickly.

## 3. Placing the pages

For each chosen page, one at a time:

1. The page is rendered.
2. A link line such as `[[lecture-notes.pdf#page=3]]` with a block id is added under
   `## Links` in the drawing's markdown.
3. An image asset is created whose source points at that line.

The pages are then added as image shapes in a single row, centered where you dropped them,
and selected. Each shape's link points at the same line, so the pages get a link marker and
Cmd-click opens the PDF at that page.

The rendered page from step 1 is handed straight to the asset store. Without that, tldraw
would ask for the image before Obsidian had indexed the new link line, and the image would
fail to load.

## 4. Drawing the pages

Nothing but the link is saved. Whenever a drawing loads a PDF page, the asset store:

1. Finds the link line by its block id and reads the file and `#page=N` from it.
2. Looks for the page in a cache in IndexedDB.
3. If it isn't cached, opens the PDF with the pdf.js that ships with Obsidian, renders the page
   at 4× its size in points, and caches the result.

Open PDFs are kept around (up to four) so rendering several pages of one file doesn't parse it
again. Cache entries are keyed on the file's modification time, so editing a PDF means its
pages are rendered fresh the next time the drawing loads.

### Why render live instead of saving images?

Rendering from the PDF keeps the vault free of a PNG per page, keeps pages in step with the
PDF, and makes cropping a matter of editing a link.[^live] The cost is a render the first time a
page is shown on each device, and pages only appear inside Obsidian.

## 5. Cropping

Pages always render in full, and tldraw's crop controls what's visible. About half a second
after a crop changes, the shape's link is updated to point at the cropped region:

```markdown
[[lecture-notes.pdf#page=3&rect=61.2,396,367.2,633.6]]
```

`rect` is in PDF units: left, bottom, right, top, measured from the page's bottom-left
corner.[^rect] tldraw stores crops as fractions of the image measured from the top-left, so the
conversion goes through pdf.js's viewport for the page. The viewport already knows about the
page's own rotation, which makes the conversion correct for pages rotated by 90°, 180° or 270°
without special cases.

A crop adds a new link line instead of editing the existing one. Duplicating a page shares
its line, so editing in place would change the other copy's link too. Lines nothing uses any
more are removed on the next save.

## 6. Removing pages

Deleting a page shape removes its link line, matched by its text (`[[…]]` followed by
`^id`) rather than by position in the file. Positions from Obsidian's index go out of date
whenever the file is rewritten on save, and removing by a stale position could cut into the
drawing data.

## Limitations

- Pages need a drawing stored in markdown; `.tldr` drawings can't hold the link lines.
- Editing a PDF while a drawing is open doesn't update its pages until the drawing is reopened.
- Typing a `&rect=` link by hand doesn't change a shape's crop. Only crop → link is synced.
- Render quality is fixed at 4×.

---

[^dialog]: Excalidraw's PDF import dialog was the starting point for which options to offer; this one keeps only page selection and scale, and takes its layout from the macOS print dialog.

[^live]: Linking to the page and rendering it live with Obsidian's pdf.js, cached in IndexedDB, is the approach the [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) takes for embedded PDFs. Its default render scale is also 4×.

[^rect]: The `#page=N&rect=l,b,r,t` syntax matches the Excalidraw plugin's. Excalidraw converts crops with a separate formula for each page rotation; this plugin uses pdf.js viewports instead.
