import { defineTheme } from '../defineTheme'

export const memphis = defineTheme({
  id: 'memphis',
  name: { zh: '孟菲斯', en: 'Memphis' },
  styles: ['@canofold/themes/expressive.css', '@canofold/themes/memphis.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
