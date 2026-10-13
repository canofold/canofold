import { defineTheme } from '../defineTheme'

export const neumorphism = defineTheme({
  id: 'neumorphism',
  name: { zh: '新拟物派', en: 'Neumorphism' },
  styles: ['@canofold/themes/neumorphism.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
