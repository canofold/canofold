import { defineTheme } from '../defineTheme'

export const dopamineDesign = defineTheme({
  id: 'dopamine-design',
  name: { zh: '多巴胺设计', en: 'Dopamine Design' },
  styles: ['@canofold/themes/expressive.css', '@canofold/themes/dopamine-design.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
