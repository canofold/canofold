import { defineTheme } from '../defineTheme'

export const glassmorphism = defineTheme({
  id: 'glassmorphism',
  name: { zh: '玻璃拟态', en: 'Glassmorphism' },
  styles: ['@canofold/themes/glassmorphism.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'dark' }]
})
