// GitHub Pages serves 404.html when a path has no file.
// Copying the built app there lets React Router open deep links like /c/:id.
import { copyFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
