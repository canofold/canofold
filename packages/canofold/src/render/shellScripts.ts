import type { ThemeDefinition } from '@canofold/themes'

/** Restore a configured theme appearance before the stylesheet is painted. */
export function themeBootScript(themes: readonly ThemeDefinition[]): string {
  const selections = themes.flatMap((theme) =>
    theme.appearances.map((appearance) => ({
      value: `${theme.id}:${appearance.id}`,
      theme: theme.id,
      appearance: appearance.id,
      colorScheme: appearance.colorScheme
    }))
  )
  return `try{var a=${JSON.stringify(selections)},s=localStorage.getItem('canofold-visual-theme'),v=a.find(function(x){return x.value===s})||a[0];if(v){document.documentElement.dataset.cfTheme=v.theme;document.documentElement.dataset.cfThemeAppearance=v.appearance;document.documentElement.classList.toggle('dark',v.colorScheme==='dark')}}catch(e){}`
}
