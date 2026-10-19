import { build, context, type BuildOptions } from 'esbuild'

const options: BuildOptions = {
  entryPoints: ['./src/index.ts', './src/worker.ts'],
  outdir: './dist',
  sourcemap: 'inline',
  minify: false,
  bundle: true,
  format: 'esm',
  define: {
    'process.env.NODE_DEBUG': 'false',
    global: 'globalThis'
  }
}

const run = async () => {
  const isServe = (globalThis as typeof globalThis & { process?: { argv: string[] } })
    .process?.argv.includes('--serve') ?? false

  if (isServe) {
    const ctx = await context(options)
    await ctx.serve({ servedir: './dist' })
    return
  }

  await build(options)
}

run().catch((error) => {
  console.error(error)
  if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
    (globalThis as typeof globalThis & { process: { exitCode: number } }).process.exitCode = 1
  }
})
