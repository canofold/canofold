/**
 * Minimal declarations for trusted project-local TSX components.
 *
 * Canofold intentionally does not publish or emulate a UI component module.
 * Projects that need full React types should install React in the authored project.
 */

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>
  }
}

declare module 'react/jsx-runtime' {
  export const Fragment: symbol
  export function jsx(type: unknown, props: unknown, key?: unknown): JSX.Element
  export function jsxs(type: unknown, props: unknown, key?: unknown): JSX.Element
}
