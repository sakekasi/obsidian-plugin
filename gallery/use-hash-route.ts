import { useEffect, useState } from 'react'

function readRoute() {
	return window.location.hash.replace(/^#\/?/, '')
}

/** The current hash path, without the leading `#` or `#/`. */
export function useHashRoute() {
	const [route, setRoute] = useState(readRoute)

	useEffect(() => {
		const onChange = () => setRoute(readRoute())
		window.addEventListener('hashchange', onChange)
		return () => window.removeEventListener('hashchange', onChange)
	}, [])

	return route
}
