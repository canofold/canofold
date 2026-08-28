import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'external-links': 'src/external-links/index.ts',
      'reading-time': 'src/reading-time/index.ts',
      'link-card': 'src/link-card/index.ts',
      kroki: 'src/kroki/index.ts',
      mermaid: 'src/mermaid/index.ts',
      plantuml: 'src/plantuml/index.ts',
      math: 'src/math/index.ts',
      pagefind: 'src/pagefind/index.ts'
    },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: true,
    clean: true,
    // Each public subpath is self-contained so publishing focused entries does
    // not create a second layer of generated shared chunks and source maps.
    splitting: false,
    sourcemap: false,
    external: ['@docfuse/markdown', 'docfuse', 'katex', 'pagefind', 'rehype-katex', 'remark-math']
  },
  {
    entry: {
      'client/kroki': 'src/client/kroki.ts',
      'client/mermaid': 'src/client/mermaid.ts',
      'client/plantuml': 'src/client/plantuml.ts'
    },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    dts: false,
    clean: false,
    // Client shells stay self-contained. Large package runtimes are declared as
    // plugin resources and copied by the Docfuse host instead of entering npm tarballs.
    splitting: false,
    sourcemap: false
  }
])
