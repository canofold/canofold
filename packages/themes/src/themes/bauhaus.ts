import { defineTheme } from '../defineTheme'

export const bauhaus = defineTheme({
  id: 'bauhaus',
  name: { zh: '包豪斯风格', en: 'Bauhaus' },
  styles: ['@canofold/themes/bauhaus.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
