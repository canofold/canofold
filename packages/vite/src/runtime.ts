export function demoRuntimeSource(
  registryEntries: string[],
  setupImport?: string,
  styleUrls: readonly string[] = []
) {
  const imports = registryEntries.join('\n')
  const setup = setupImport ?? 'const CanofoldDemoSetup = null;'
  return `${imports}
${setup}
import React from 'react';
import { createRoot } from 'react-dom/client';

const registry = new Map(CANOFOLD_DEMO_REGISTRY);
const iframeStyleUrls = ${JSON.stringify(styleUrls)};
const roots = new Set();
const frameObservers = new Set();
let eventController;

class DemoBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return React.createElement('div', { className: 'cf-demo-error', role: 'alert' }, this.props.message);
  }
}

function componentFor(id) {
  const value = registry.get(id);
  const component = value && (value.default || value.Demo);
  if (!component) throw new Error('Demo module ' + id + ' must export a default React component.');
  return component;
}

export function mountDemo(element, id, failedLabel) {
  const Demo = componentFor(id);
  const content = React.createElement(Demo);
  const wrapped = CanofoldDemoSetup ? React.createElement(CanofoldDemoSetup, null, content) : content;
  const root = createRoot(element);
  roots.add(root);
  root.render(React.createElement(DemoBoundary, { message: failedLabel }, wrapped));
  return root;
}

function iframeDocument(id, failedLabel) {
  const script = \`import(\${JSON.stringify(import.meta.url)}).then(({ mountDemo }) => mountDemo(document.getElementById('root'),\${JSON.stringify(id)},\${JSON.stringify(failedLabel)})).catch((error) => { console.error('[Canofold demo iframe]', error); const root = document.getElementById('root'); root.setAttribute('role', 'alert'); root.textContent = \${JSON.stringify(failedLabel)}; });\`;
  const styles = iframeStyleUrls.map((href) => '<link rel="stylesheet" href="' + href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">').join('');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + styles + '<style>html,body,#root{min-height:100%;margin:0}body{display:grid;place-items:center;padding:24px;box-sizing:border-box;font-family:system-ui,sans-serif}</style></head><body><div id="root"></div><script type="module">' + script.replace(/<\\/script/gi, '<\\\\/script') + '<\\/script></body></html>';
}

function fitFrame(frame) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) return;
  const update = () => {
    frame.style.height = Math.max(192, Math.ceil(frameDocument.documentElement.scrollHeight)) + 'px';
  };
  update();
  if (typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(update);
  observer.observe(frameDocument.documentElement);
  frameObservers.add(observer);
}

function bindSourceToggle(button, signal) {
  const sourceId = button.getAttribute('aria-controls');
  const source = sourceId && document.getElementById(sourceId);
  if (!source) return;
  const setExpanded = (expanded) => {
    const label = button.getAttribute(expanded ? 'data-cf-demo-hide-label' : 'data-cf-demo-show-label') || '';
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', label);
    source.hidden = !expanded;
    const tooltip = button.querySelector('[data-cf-demo-tooltip]');
    if (tooltip) tooltip.textContent = label;
  };
  setExpanded(button.getAttribute('aria-expanded') === 'true');
  button.addEventListener('click', () => setExpanded(button.getAttribute('aria-expanded') !== 'true'), { signal });
}

function standaloneDemo() {
  const id = new URL(window.location.href).searchParams.get('canofold-demo');
  if (!id || !registry.has(id)) return false;
  const preview = Array.from(document.querySelectorAll('[data-cf-demo-preview]')).find(
    (element) => element.getAttribute('data-cf-demo-id') === id
  );
  const failed = preview?.getAttribute('data-cf-demo-failed-label') || 'This example could not be loaded.';
  const root = document.createElement('main');
  root.className = 'cf-demo-standalone';
  root.setAttribute('data-cf-demo-id', id);
  document.documentElement.setAttribute('data-cf-demo-standalone', '');
  document.body.replaceChildren(root);
  mountDemo(root, id, failed);
  return true;
}

export async function bootstrapDemos() {
  window.__canofoldDemoDispose?.();
  if (standaloneDemo()) {
    window.__canofoldDemoDispose = () => {
      roots.forEach((root) => root.unmount());
      roots.clear();
      document.documentElement.removeAttribute('data-cf-demo-standalone');
    };
    return;
  }
  document.documentElement.removeAttribute('data-cf-demo-standalone');
  eventController = new AbortController();
  document.querySelectorAll('[data-cf-demo-source-toggle]').forEach((button) => bindSourceToggle(button, eventController.signal));
  document.querySelectorAll('[data-cf-demo-preview]').forEach((preview) => {
    const id = preview.getAttribute('data-cf-demo-id');
    if (!id) return;
    const loading = preview.getAttribute('data-cf-demo-loading-label') || 'Loading example…';
    const failed = preview.getAttribute('data-cf-demo-failed-label') || 'This example could not be loaded.';
    preview.textContent = loading;
    try {
      const card = preview.closest('[data-cf-component="demo"]');
      if (card?.getAttribute('data-cf-demo-sandbox') === 'iframe') {
        const frame = document.createElement('iframe');
        frame.className = 'cf-demo-frame';
        frame.title = card.querySelector('.cf-demo-title')?.textContent || 'Component example';
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer';
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        frame.addEventListener('load', () => fitFrame(frame), { once: true });
        frame.srcdoc = iframeDocument(id, failed);
        preview.replaceChildren(frame);
      } else {
        preview.textContent = '';
        mountDemo(preview, id, failed);
      }
    } catch (error) {
      console.error('[Canofold demo]', error);
      preview.textContent = failed;
      preview.setAttribute('data-cf-demo-error', '');
    }
  });
  window.__canofoldDemoDispose = () => {
    eventController?.abort();
    eventController = undefined;
    frameObservers.forEach((observer) => observer.disconnect());
    frameObservers.clear();
    roots.forEach((root) => root.unmount());
    roots.clear();
  };
}

window.__canofoldBootstrapDemos = bootstrapDemos;
void bootstrapDemos();

if (import.meta.hot) {
  import.meta.hot.accept(() => void bootstrapDemos());
}
`
}
