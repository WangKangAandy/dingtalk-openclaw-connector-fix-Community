// Bundle only the test entry; the real host SDK remains external.
// node tests/memory-scope/ingress-probe/build.mjs /absolute/output/handler-bundle.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const output = process.argv[2]
if (!output || !path.isAbsolute(output)) throw new Error('An absolute fixture bundle output path is required')
await build({
  stdin: { contents: fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8'),
    resolveDir: repo, sourcefile: 'ingress-probe.mjs', loader: 'js' },
  bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external', outfile: output,
})
