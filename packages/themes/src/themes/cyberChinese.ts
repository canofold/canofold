import { defineTheme } from '../defineTheme'

export const cyberChinese = defineTheme({
  id: 'cyber-chinese',
  name: { zh: '赛博中华', en: 'Cyber Chinese' },
  styles: ['@canofold/themes/expressive.css', '@canofold/themes/cyber-chinese.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'dark' }]
})
