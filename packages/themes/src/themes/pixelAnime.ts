import { defineTheme } from '../defineTheme'

export const pixelAnime = defineTheme({
  id: 'pixel-anime',
  name: { zh: '像素动漫', en: 'Pixel Anime' },
  styles: ['@canofold/themes/expressive.css', '@canofold/themes/pixel-anime.css'],
  appearances: [{ id: 'default', name: { zh: '默认', en: 'Default' }, colorScheme: 'dark' }]
})
