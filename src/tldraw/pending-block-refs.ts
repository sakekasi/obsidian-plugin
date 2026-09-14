// Link lines are written to the markdown file before the shape or asset that uses them is
// created. A save in between would see the line as unused and prune it, so freshly added
// block ids are protected for a short while.

const PENDING_MS = 60_000

const pending = new Map<string, number>()

export function markBlockRefPending(id: string) {
	pending.set(id, Date.now())
}

export function isBlockRefPending(id: string) {
	const addedAt = pending.get(id)
	if (addedAt === undefined) return false
	if (Date.now() - addedAt < PENDING_MS) return true
	pending.delete(id)
	return false
}
