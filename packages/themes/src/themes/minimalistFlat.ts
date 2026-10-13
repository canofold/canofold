import { defineTheme } from '../defineTheme'

export const minimalistFlat = defineTheme({
  id: 'minimalist-flat',
  name: { zh: '极简扁平风', en: 'Minimalist Flat' },
  styles: ['@canofold/themes/minimalist-flat.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
