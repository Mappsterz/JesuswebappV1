import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Walk With Me — Your AI Spiritual Guide',
    short_name: 'Walk With Me',
    description:
      'A compassionate AI guide inspired by the teachings and wisdom of Jesus Christ.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0e1a',
    theme_color: '#0a0e1a',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
