import esbuild from 'esbuild'

esbuild.build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  bundle: true,
  sourcemap: true,
  platform: 'node',
  target: 'node16',
  format: 'esm',
  logLevel: 'info',
  external: []
}).catch(() => process.exit(1))
