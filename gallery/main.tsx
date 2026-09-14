import './obsidian-shim'
import './obsidian-vars.css'
import './gallery.css'
import 'tldraw/tldraw.css'

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { GalleryApp } from './GalleryApp'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root')

createRoot(rootEl).render(<GalleryApp />)
