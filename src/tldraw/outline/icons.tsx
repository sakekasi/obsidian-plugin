import * as React from 'react'
import { ReactNode } from 'react'

function Svg({ children }: { children: ReactNode }) {
	return (
		<svg
			className="ptl-outline-icon"
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			{children}
		</svg>
	)
}

export const Icon = {
	Chevron: () => (
		<Svg>
			<path d="M6.5 4.5 10 8l-3.5 3.5" />
		</Svg>
	),
	Lock: () => (
		<Svg>
			<rect x="4" y="7" width="8" height="6" rx="1.2" />
			<path d="M6 7V5.2a2 2 0 0 1 4 0V7" />
		</Svg>
	),
	Unlock: () => (
		<Svg>
			<rect x="4" y="7" width="8" height="6" rx="1.2" />
			<path d="M6 7V5.2a2 2 0 0 1 3.8-.9" />
		</Svg>
	),
	Eye: () => (
		<Svg>
			<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
			<circle cx="8" cy="8" r="2" />
		</Svg>
	),
	EyeOff: () => (
		<Svg>
			<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
			<path d="M2.5 2.5l11 11" />
		</Svg>
	),
	Search: () => (
		<Svg>
			<circle cx="7" cy="7" r="4.5" />
			<path d="m10.5 10.5 3.5 3.5" />
		</Svg>
	),
	Plus: () => (
		<Svg>
			<path d="M8 3v10M3 8h10" />
		</Svg>
	),
	Sidebar: () => (
		<Svg>
			<rect x="1.5" y="3" width="13" height="10" rx="2" />
			<path d="M5.5 3v10" />
		</Svg>
	),
	CollapseAll: () => (
		<Svg>
			<path d="M2 4h7M2 8h7M2 12h7M11.5 10.5 13 12l1.5-1.5M11.5 5.5 13 4l1.5 1.5" />
		</Svg>
	),
}

const TYPE_ICONS: Record<string, () => React.ReactElement> = {
	frame: () => (
		<Svg>
			<path d="M5 2v12M11 2v12M2 5h12M2 11h12" />
		</Svg>
	),
	group: () => (
		<Svg>
			<rect x="2.5" y="2.5" width="11" height="11" rx="1" strokeDasharray="2 2" />
		</Svg>
	),
	text: () => (
		<Svg>
			<path d="M4 4h8M8 4v9" />
		</Svg>
	),
	line: () => (
		<Svg>
			<path d="M3.5 12.5l9-9" />
		</Svg>
	),
	arrow: () => (
		<Svg>
			<path d="M3.5 12.5l9-9M7 3.5h5.5V9" />
		</Svg>
	),
	draw: () => (
		<Svg>
			<path d="M2 11c2-4 3.5 1.5 6-2s3.5-2.5 6-4.5" />
		</Svg>
	),
	highlight: () => (
		<Svg>
			<path d="M2 11c2-4 3.5 1.5 6-2s3.5-2.5 6-4.5" strokeWidth="2.5" opacity="0.6" />
		</Svg>
	),
	geo: () => (
		<Svg>
			<rect x="3" y="3" width="10" height="10" rx="1.5" />
		</Svg>
	),
	note: () => (
		<Svg>
			<path d="M3 3h10v7l-3 3H3ZM10 13v-3h3" />
		</Svg>
	),
	image: () => (
		<Svg>
			<rect x="2.5" y="3" width="11" height="10" rx="1.5" />
			<path d="m3 12 3.5-3.5 2 2 1.5-1.5 3 3" />
			<circle cx="10.5" cy="6" r="1" />
		</Svg>
	),
}

const DefaultTypeIcon = () => (
	<Svg>
		<path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" />
	</Svg>
)

export function ShapeTypeIcon({ type }: { type: string }) {
	const Component = TYPE_ICONS[type] ?? DefaultTypeIcon
	return <Component />
}
