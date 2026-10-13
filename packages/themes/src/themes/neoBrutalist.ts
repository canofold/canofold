import { defineTheme } from '../defineTheme'

export const neoBrutalist = defineTheme({
  id: 'neo-brutalist',
  name: { zh: '新野兽派', en: 'Neo-Brutalist' },
  styles: ['@canofold/themes/neo-brutalist.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
