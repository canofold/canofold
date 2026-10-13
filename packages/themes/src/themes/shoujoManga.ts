import { defineTheme } from '../defineTheme'

export const shoujoManga = defineTheme({
  id: 'shoujo-manga',
  name: { zh: '少女漫画', en: 'Shoujo Manga' },
  styles: ['@canofold/themes/expressive.css', '@canofold/themes/shoujo-manga.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'light' }]
})
