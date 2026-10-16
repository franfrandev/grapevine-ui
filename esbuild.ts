import { build } from 'esbuild'

build({
  entryPoints: ['./src/index.ts', './src/worker.ts'],
  outfile: './dist/index.ts',
  sourcemap: 'inline',
  minify: false,
  bundle: true,
  define: {
    'process.env.NODE_DEBUG': 'false',
    global: 'globalThis'
  }
})
  .catch(() => process.exit(1))
