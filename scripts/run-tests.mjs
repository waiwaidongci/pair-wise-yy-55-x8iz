// 用 esbuild 把 scripts/*.test.ts 各自打包到临时目录后依次运行
import { build } from 'esbuild'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const files = process.argv.slice(2)
const entryPoints = files.length ? files : readdirSync('scripts').filter((f) => f.endsWith('.test.ts')).map((f) => join('scripts', f))
const dir = mkdtempSync(join(tmpdir(), 'score-tests-'))
try {
  for (const entry of entryPoints) {
    const out = join(dir, entry.replace(/[\\/]/g, '-') + '.mjs')
    await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' })
    console.log(`\n# ${entry}`)
    execFileSync(process.execPath, [out], { stdio: 'inherit' })
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
