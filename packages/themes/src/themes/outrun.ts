import { defineTheme } from '../defineTheme'

export const outrun = defineTheme({
  id: 'outrun',
  name: { zh: 'Outrun 复古未来', en: 'Outrun' },
  styles: ['@canofold/themes/expressive.css', '@canofold/themes/outrun.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'dark' }]
})
