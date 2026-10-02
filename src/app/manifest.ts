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
 * Cores: `background_color` é o fundo do ecrã de arranque (Android) — o azul
 * da marca, igual ao ecrã de arranque da própria app (`<AppSplash>`, o que se
 * vê enquanto o JS carrega), para abrir sem salto de cor; `theme_color` pinta a
 * barra de estado — o azul da marca, igual à barra do topo (`<Header>`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Order It All!',
    short_name: 'Order It All',
    description: 'Organiza as compras do grupo e acerta as contas.',
    lang: 'pt-PT',
    dir: 'ltr',
    // `/groups` e não `/`: o `/` é o ecrã de boas-vindas — com sessão fazia
    // um flash dele antes de redirecionar. Sem sessão, `/groups` manda para
    // `/`. O `id` fica `/` para não mudar a identidade das apps já instaladas.
    start_url: '/groups',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#2563eb',
    theme_color: '#2563eb',
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
