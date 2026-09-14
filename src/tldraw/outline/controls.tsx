import * as React from 'react'
import { ReactNode, useEffect, useRef } from 'react'

export function IconButton({
	title,
	onClick,
	isActive = false,
	className = '',
	children,
}: {
	title: string
	onClick: (e: React.MouseEvent) => void
	isActive?: boolean
	className?: string
	children: ReactNode
}) {
	return (
		<button
			type="button"
			className={`ptl-outline-icon-button ${isActive ? 'is-active' : ''} ${className}`}
			title={title}
			aria-label={title}
			aria-pressed={isActive}
			tabIndex={-1}
			onClick={onClick}
			onDoubleClick={(e) => e.stopPropagation()}
		>
			{children}
		</button>
	)
}

/** Inline text field. Enter or blur commits, Escape cancels. Keys never reach tldraw. */
export function RenameInput({
	initial,
	onCommit,
	onCancel,
}: {
	initial: string
	onCommit: (value: string) => void
	onCancel: () => void
}) {
	const ref = useRef<HTMLInputElement>(null)
	const isDone = useRef(false)

	useEffect(() => {
		ref.current?.focus()
		ref.current?.select()
	}, [])

	const finish = (commit: boolean) => {
		if (isDone.current) return
		isDone.current = true
		if (!commit) return onCancel()
		onCommit(ref.current?.value ?? '')
	}

	return (
		<input
			ref={ref}
			className="ptl-outline-rename"
			defaultValue={initial}
			spellCheck={false}
			onClick={(e) => e.stopPropagation()}
			onDoubleClick={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation()
				if (e.key === 'Enter') finish(true)
				if (e.key === 'Escape') finish(false)
			}}
			onBlur={() => finish(true)}
		/>
	)
}
