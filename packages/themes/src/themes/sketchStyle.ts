import { defineTheme } from '../defineTheme'

export const sketchStyle = defineTheme({
  id: 'sketch-style',
  name: { zh: '铅笔手绘风', en: 'Sketch Style' },
  styles: ['@canofold/themes/sketch-style.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
