export function demoRuntimeSource(
  registryEntries: string[],
  setupImport: string | undefined,
  markdownClientSpecifier: string,
  runtimePath: string
) {
  return `${registryEntries.join('\n')}
${setupImport ?? 'const CanofoldDemoSetup = undefined;'}
import { createDemoRuntime } from ${JSON.stringify(runtimePath)};
export { enhanceMarkdown } from ${JSON.stringify(markdownClientSpecifier)};
const runtime = createDemoRuntime(new Map(CANOFOLD_DEMO_REGISTRY), CanofoldDemoSetup, import.meta.url);
export const mountDemo = runtime.mountDemo;
window.__canofoldBootstrapDemos = runtime.bootstrapDemos;
void runtime.bootstrapDemos();
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(runtime.dispose);
}
`
}
