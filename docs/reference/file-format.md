# Drawing file format

A drawing stored in markdown is an ordinary `.md` file with three parts: frontmatter, a
**Links** section, and a **Drawing** section holding the tldraw document as JSON.[^sections]

```markdown
---
tldraw-file: true
tags:
  - tldraw
---

Anything you write here is kept.

# tldraw Data

## Links

[[meeting-notes#Agenda]]
^3f2a9c1e-5b7d-4c21-9a0e-1f2b3c4d5e6f

![[Attachments/photo.png]]
^c09e44f2-8a1b-4d3c-b2e1-0a9b8c7d6e5f

## Drawing

```json !!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!
{
	"meta": { "uuid": "…", "plugin-version": "…", "tldraw-version": "…" },
	"raw": { "tldrawFileFormatVersion": 1, "schema": { … }, "records": [ … ] }
}
!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!
```
```

## Frontmatter

| Key | Meaning |
| --- | --- |
| `tldraw-file: true` | Marks the file as a drawing. The key can be changed in settings. |
| `tags` | Tags added from the plugin's settings. |

## Notes above the data

Text between the frontmatter and `# tldraw Data` is left alone. Text found inside the
tldraw sections that isn't a link line is moved up here on the next save.

## Links section

Each entry is a link line followed by a block id line:

```markdown
[[target#subpath]]
^<uuid>
```

- The link is a normal Obsidian link, generated with your vault's link settings (wikilink
  or markdown link, shortest or full path).
- Images use an embed (`![[…]]`); other links use a plain link.
- The block id is always a UUID. Only UUID block ids are managed by the plugin.
- New entries are inserted directly under `## Links`.

Because these are real links in the markdown body, Obsidian updates them when the target
file is renamed or moved.[^renames]

## Drawing section

The code block contains `{ meta, raw }`:

- `meta.uuid` identifies the document. `plugin-version` and `tldraw-version` record what
  last saved it.
- `raw` is a tldraw file: `tldrawFileFormatVersion`, `schema`, and `records` (pages,
  shapes, assets, bindings…).

The `START`/`END` phrases are how the plugin finds the data. Don't edit them.

## How records point at links

Records never store a vault path. They store `obsidian.blockref.<uuid>`, which names an
entry in the Links section:

| Where | Value |
| --- | --- |
| Shape link (`shape.meta.link`) | `obsidian.blockref.<uuid>` |
| Image asset (`asset.props.src`) | `asset:obsidian.blockref.<uuid>` |

To resolve one, the plugin finds the block with that id in Obsidian's metadata cache and
reads the link on that line.

`shape.meta.link` can also hold:

| Value | When |
| --- | --- |
| `https://…`, `obsidian://…` | Web and Obsidian URLs, which don't need rename tracking. |
| `[[path#subpath]]` | The target file didn't exist when the link was set, or the drawing is a `.tldr` file. These don't follow renames. |
| `null` | The link was removed. |

### Subpaths

| Subpath | Meaning |
| --- | --- |
| `#Heading` | A heading in a note |
| `#^block` | A block in a note |
| `#page=3` | A page in a PDF |
| `#page=3&rect=l,b,r,t` | A region of a PDF page, in PDF user-space units (left, bottom, right, top)[^pdf] |

## Saving and cleanup

Every save rewrites the file into this layout:

1. The frontmatter and your notes are kept.
2. Link lines are collected from the tldraw sections (or, in older files, from directly after
   the frontmatter).
3. A link line is **kept** if any record in the drawing references its block id, or it was
   added in the last minute (so a save can't remove a link before its shape exists).
4. All other link lines are removed.
5. The code block is replaced with the current document.

Older files without the headings are migrated the first time they are saved.

### Caveat: undo after a save

If you delete a linked shape and the file saves, its link line is removed. Undoing the
delete brings the shape back, but its link no longer resolves until it's set again.

## `.tldr` files

`.tldr` files are plain tldraw JSON with no markdown. Images are stored inline, and shape
links are stored as raw text in `meta.link`.

---

[^sections]: The heading structure follows the [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin), which groups `## Element Links` and `## Embedded Files` under a `# Excalidraw Data` heading.

[^renames]: Keeping links as real markdown links so Obsidian's own rename handling updates them is also how the Excalidraw plugin tracks element links and embedded files. The block-ref indirection (`obsidian.blockref.<uuid>`) predates this and comes from the original tldraw-in-obsidian plugin's image storage.

[^pdf]: The `#page=N&rect=l,b,r,t` subpath, with the rect in PDF user-space units, matches the Excalidraw plugin's syntax for linking to and cropping PDF pages.
