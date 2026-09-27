import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — servido pelo Next em `/manifest.webmanifest` com
 * `Content-Type: application/manifest+json` (o `<link rel="manifest">` é
 * posto automaticamente). Substitui o antigo `public/manifest.json`.
 *
 * Critérios de instalação do Chrome (web.dev/articles/install-criteria):
 * `name`/`short_name`, ícones 192 e 512, `start_url`, `display` standalone e
 * `prefer_related_applications` falso. O PROMPT de instalação
 * (`beforeinstallprompt`) exige ainda um service worker com `fetch` handler
 * — é o `public/sw.js` em produção (ver `src/lib/serviceWorker.ts`).
 *
 * Ícones: `any` (desenho com transparência — desktop, atalhos) e `maskable`
 * (fundo sólido, desenho dentro do círculo seguro de 80%) para os ícones
 * adaptativos do Android — sem estes, o Android metia o desenho transparente
 * num círculo branco pequeno.
 *
 * Cores: `background_color` é o fundo do ecrã de arranque (Android) — igual
 * ao fundo da app para não haver salto de cor ao abrir; `theme_color` pinta a
 * barra de estado — igual ao cabeçalho (branco), que já não é azul.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Order It All!',
    short_name: 'Order It All',
    description: 'Organiza compras em grupo e divide contas sem discussões.',
    lang: 'pt-PT',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#ffffff',
    categories: ['finance', 'productivity', 'shopping'],
    prefer_related_applications: false,
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Grupos', short_name: 'Grupos', url: '/groups', icons: [{ src: '/icon-maskable-192x192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Amigos', short_name: 'Amigos', url: '/people', icons: [{ src: '/icon-maskable-192x192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Atividade', short_name: 'Atividade', url: '/activity', icons: [{ src: '/icon-maskable-192x192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
