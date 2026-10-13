import { defineTheme } from '../defineTheme'

export const handDrawnDoodle = defineTheme({
  id: 'hand-drawn-doodle',
  name: { zh: '手绘涂鸦风', en: 'Hand-Drawn Doodle' },
  styles: ['@canofold/themes/hand-drawn-doodle.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
