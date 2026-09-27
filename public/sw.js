// Service worker da app — duas partes:
//
//  1. CASCA OFFLINE SÓ DE LEITURA (Fase 13 · Parte B) — ativa apenas quando
//     registado como `/sw.js?cache=1`, o que só acontece em builds de produção
//     (`src/lib/serviceWorker.ts`). Em `next dev` o SW é o mesmo ficheiro sem
//     `?cache=1` → não intercepta pedido nenhum (nada de cache no meio do HMR).
//     Guarda SÓ a casca: estáticos (`/_next/static`, ícones, manifest) e o HTML
//     de ecrãs já visitados, para a app abrir sem rede e mostrar os dados que
//     já estão no Dexie. NUNCA guarda a API do PocketBase, `/api/*`, payloads
//     RSC, nem nada que não seja GET — e não há fila de escritas.
//
//  2. NOTIFICAÇÕES PUSH (sempre) — mais abaixo.
//
// Mudar `VERSION` sempre que a lógica de cache mudar: o browser deteta o SW
// novo, ativa-o silenciosamente no próximo fecho/reabertura do site e as
// caches antigas são limpas.

const VERSION = 'v4';
const SW_PARAMS = new URL(self.location.href).searchParams;
const CACHE_ENABLED = SW_PARAMS.get('cache') === '1';
// Cada deploy regista o SW com `build=<id>` (SW novo → pré-guarda os estáticos
// desse build). HTML e estáticos vivem e morrem juntos por build: nunca fica
// uma página guardada a apontar para JS que já não está na cache.
const BUILD = SW_PARAMS.get('build') || 'unknown';
const STATIC_CACHE = `oia-static-${VERSION}-${BUILD}`;
const PAGES_CACHE = `oia-pages-${VERSION}-${BUILD}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [
    OFFLINE_URL,
    '/manifest.webmanifest',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png',
    '/icon-maskable-192x192.png',
    '/icon-maskable-512x512.png',
    '/apple-touch-icon.png',
    '/favicon.ico',
];
const NAV_TIMEOUT_MS = 3000;
const MAX_PAGES = 60;

self.addEventListener('install', (event) => {
    if (!CACHE_ENABLED) return;
    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC_CACHE);
            await cache.addAll(PRECACHE.filter((url) => url !== OFFLINE_URL));
            // TODOS os estáticos do build (lista gerada pelo servidor) — inclui os
            // chunks carregados sob demanda, que o HTML não referencia.
            const manifest = await fetch('/sw-manifest.json', { cache: 'no-store' }).then((r) => r.json());
            const assets = (manifest.assets || []).filter((a) => a.startsWith('/_next/static/'));
            for (let i = 0; i < assets.length; i += 10) {
                await Promise.all(
                    assets.slice(i, i + 10).map(async (path) => {
                        const res = await fetch(path);
                        if (!res.ok) throw new Error(`precache ${path}: ${res.status}`);
                        await cache.put(path, res);
                    }),
                );
            }
            const offline = await fetch(OFFLINE_URL);
            if (isCacheableHtml(offline)) await storePage(self.location.origin + OFFLINE_URL, offline);
            // 1.ª instalação: ativa já (não há versão antiga a proteger).
            // Atualizações ficam em `waiting` — só assumem o controlo quando
            // não houver mais nenhuma tab a usar a versão antiga (fecho e
            // reabertura do site), o standard do browser sem qualquer aviso.
            if (!self.registration.active) await self.skipWaiting();
        })(),
    );
});

self.addEventListener('activate', (event) => {
    if (!CACHE_ENABLED) return;
    event.waitUntil(
        (async () => {
            const keep = new Set([STATIC_CACHE, PAGES_CACHE]);
            for (const key of await caches.keys()) {
                if (key.startsWith('oia-') && !keep.has(key)) await caches.delete(key);
            }
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('message', (event) => {
    const data = event.data || {};
    // A navegação no cliente (RSC) nunca pede o HTML do ecrã — sem isto, só os
    // ecrãs abertos "a frio" teriam cópia offline. A app pede para guardar o
    // ecrã em que acabou de entrar (só com boa rede, ver ServiceWorkerRegistrar).
    if (data.type === 'CACHE_PAGE' && CACHE_ENABLED && typeof data.url === 'string') {
        event.waitUntil(cachePage(data.url));
    }
});

async function cachePage(href) {
    const url = new URL(href);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
    try {
        const response = await fetch(url.origin + url.pathname + url.search, { credentials: 'same-origin' });
        if (isCacheableHtml(response)) await storePage(url.origin + url.pathname, response);
    } catch {
        // sem rede — fica a cópia que houver
    }
}

// Apaga as entradas mais antigas acima de `max` — nunca a página /offline nem
// os ficheiros pré-guardados (são o fallback quando não há mais nada).
async function trim(cacheName, max) {
    const cache = await caches.open(cacheName);
    const keys = (await cache.keys()).filter((req) => {
        const path = new URL(req.url).pathname;
        return path !== OFFLINE_URL && !PRECACHE.includes(path);
    });
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Guarda o HTML de um ecrã E os estáticos que ele referencia (`/_next/static/…`).
// Sem isto, uma cópia do HTML podia depender de JS/CSS que só estavam na cache
// HTTP do browser — que o iOS limpa — e o ecrã abria partido sem rede.
async function storePage(key, response) {
    const html = await response.clone().text();
    const pages = await caches.open(PAGES_CACHE);
    await pages.put(key, response);
    const assets = new Set();
    for (const match of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(match[0]);
    const statics = await caches.open(STATIC_CACHE);
    await Promise.all(
        [...assets].map(async (path) => {
            if (await statics.match(path)) return;
            try {
                const res = await fetch(path);
                if (res.ok) await statics.put(path, res);
            } catch {
                // sem rede a meio — fica para a próxima
            }
        }),
    );
    await trim(PAGES_CACHE, MAX_PAGES);
}

function isCacheableHtml(response) {
    return (
        response &&
        response.ok &&
        !response.redirected &&
        response.type === 'basic' &&
        (response.headers.get('content-type') || '').includes('text/html')
    );
}

// Navegação (HTML): rede primeiro, com limite. Se a rede demorar mais de
// NAV_TIMEOUT_MS e houver cópia deste URL, mostra a cópia (e a rede continua
// a atualizá-la em segundo plano). Sem rede: cópia deste URL → /offline.
async function handleNavigation(event) {
    const request = event.request;
    const cache = await caches.open(PAGES_CACHE);
    const url = new URL(request.url);
    const key = url.origin + url.pathname;

    const network = fetch(request).then((response) => {
        if (isCacheableHtml(response)) event.waitUntil(storePage(key, response.clone()));
        return response;
    });
    event.waitUntil(network.catch(() => undefined));

    const cached = await cache.match(key);
    if (cached) {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NAV_TIMEOUT_MS));
        try {
            return await Promise.race([network, timeout]);
        } catch {
            return cached;
        }
    }
    try {
        return await network;
    } catch {
        return (await caches.match(self.location.origin + OFFLINE_URL)) || Response.error();
    }
}

// Estáticos com hash (`/_next/static`): nunca mudam → cache primeiro.
async function handleImmutable(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
}

// Ícones/manifest (sem hash): cópia já, e atualiza em segundo plano.
async function handleStaleWhileRevalidate(event) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(event.request);
    const network = fetch(event.request).then(async (response) => {
        if (response.ok && response.type === 'basic') await cache.put(event.request, response.clone());
        return response;
    });
    event.waitUntil(network.catch(() => undefined));
    return cached || network;
}

if (CACHE_ENABLED) {
    self.addEventListener('fetch', (event) => {
        const request = event.request;
        if (request.method !== 'GET') return; // escritas: nunca, nem em fila
        const url = new URL(request.url);
        if (url.origin !== self.location.origin) return; // PocketBase e afins: só rede
        if (url.pathname.startsWith('/api/')) return; // rotas de servidor: só rede
        // Payloads RSC (navegação no cliente, prefetch): só rede. Se falharem, o
        // Next faz uma navegação completa — que cai no handleNavigation.
        if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return;

        if (request.mode === 'navigate') {
            event.respondWith(handleNavigation(event));
            return;
        }
        if (url.pathname.startsWith('/_next/static/')) {
            event.respondWith(handleImmutable(request));
            return;
        }
        if (/\.(png|svg|ico|webmanifest|json|woff2?)$/.test(url.pathname) && !url.pathname.startsWith('/_next/')) {
            event.respondWith(handleStaleWhileRevalidate(event));
        }
    });
}

// ---------------------------------------------------------------------------
// Notificações push
// ---------------------------------------------------------------------------

self.addEventListener('push', function (event) {
    if (!event.data) {
        console.log('Push event but no data');
        return;
    }

    const data = event.data.json();
    const { title, body, icon, url, tag } = data;

    const options = {
        body,
        icon: icon || '/android-chrome-192x192.png',
        badge: '/favicon-48x48.png',
        vibrate: [100, 50, 100],
        // Agrupa notificações sobre o mesmo destino (ex.: a mesma viagem) em vez
        // de as empilhar — a mais recente substitui a anterior. `renotify` faz
        // o telemóvel voltar a alertar (vibrar) mesmo ao substituir, para a
        // atualização não passar em silêncio.
        tag: tag || url || undefined,
        renotify: Boolean(tag || url),
        data: {
            url: url || '/',
        },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    // Handle click - open the specific URL
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            const url = event.notification.data.url;

            // If a window is already open with this URL, focus it
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }

            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// A subscrição pode rodar sozinha (renovação do browser) sem nenhum evento
// `push` associado. Este SW estático não tem a chave pública VAPID (só existe
// no bundle da app, injetada via env var) para se poder re-subscrever aqui —
// por isso avisa as páginas abertas, que têm a chave e tratam de gravar a
// subscrição nova. Se não houver nenhuma página aberta neste preciso momento,
// a app volta a sincronizar sozinha da próxima vez que abrir (ver
// `PushNotificationManager.tsx`).
self.addEventListener('pushsubscriptionchange', function (event) {
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            clientList.forEach(function (client) {
                client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
            });
        })
    );
});
