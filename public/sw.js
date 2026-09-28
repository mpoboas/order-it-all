// Service worker da app — duas partes:
//
//  1. CASCA OFFLINE SÓ DE LEITURA (Fase 13 · Parte B) — ativa apenas quando
//     registado como `/sw.js?cache=1`, o que só acontece em builds de produção
//     (`src/lib/serviceWorker.ts`). Em `next dev` o SW é o mesmo ficheiro sem
//     `?cache=1` → não intercepta pedido nenhum e apaga as caches da casca.
//     Guarda SÓ a casca: estáticos (`/_next/static`, ícones, manifest) e o HTML
//     de ecrãs já visitados, para a app abrir sem rede e mostrar os dados que
//     já estão no Dexie. NUNCA guarda a API do PocketBase, `/api/*`, payloads
//     RSC, nem nada que não seja GET — e não há fila de escritas.
//
//  2. NOTIFICAÇÕES PUSH (sempre) — mais abaixo.
//
// Atualizações (padrão "immediate update" do Workbox/web.dev, Fase 18):
//  - a versão nova assume JÁ (`skipWaiting` + `clients.claim`) — numa WPA do
//    Android a janela nunca fecha de verdade, e a espera por defeito deixava a
//    app presa num build antigo até ir para segundo plano;
//  - para as páginas ainda abertas no build anterior não rebentarem, os
//    estáticos do build ANTERIOR ficam guardados (os ficheiros com hash nunca
//    mudam de conteúdo) — só os de há dois builds são apagados;
//  - a instalação é rápida (poucos ficheiros); o resto do build é guardado em
//    segundo plano depois de ativo (`WARM`), sem atrasar a troca;
//  - navegação: rede primeiro com *navigation preload*, cópia só se a rede
//    falhar ou demorar > 3 s — e a cópia é sempre do build ativo.
// Rede de segurança: se o servidor já correr outro build (ou `next dev`) e
// este SW não souber, autodestrói-se (ver `selfDestruct`).

const VERSION = 'v7';
const SW_PARAMS = new URL(self.location.href).searchParams;
const CACHE_ENABLED = SW_PARAMS.get('cache') === '1';
// Cada build regista o SW com `build=<id>` (SW novo → guarda os estáticos
// desse build). HTML e estáticos vivem e morrem juntos por build.
const BUILD = SW_PARAMS.get('build') || 'unknown';
const STATIC_PREFIX = `oia-static-${VERSION}-`;
const STATIC_CACHE = `${STATIC_PREFIX}${BUILD}`;
const PAGES_CACHE = `oia-pages-${VERSION}-${BUILD}`;
const META_CACHE = 'oia-meta';
const OFFLINE_URL = '/offline';
const PRECACHE = [
    '/manifest.webmanifest',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png',
    '/icon-maskable-192x192.png',
    '/icon-maskable-512x512.png',
    '/apple-touch-icon.png',
    '/favicon.ico',
    '/favicon.svg',
];
const NAV_TIMEOUT_MS = 3000;
const MAX_PAGES = 60;
/** Nunca passam pelo SW — são como a app/SW sabem que build o servidor tem. */
const BYPASS = new Set(['/sw.js', '/sw-manifest.json']);

// --- Build do servidor --------------------------------------------------------

async function serverBuild() {
    try {
        return await fetch(`/sw-manifest.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json());
    } catch {
        return null; // sem rede: não se decide nada
    }
}

/** Só com um id EXPLÍCITO e diferente — `null` (servidor que não sabe o seu
 *  build) nunca conta como obsoleto, senão entrava em ciclo. */
function isObsolete(manifest) {
    return !!manifest && typeof manifest.buildId === 'string' && manifest.buildId !== '' && manifest.buildId !== BUILD;
}

/** O servidor já corre outro build (ou `next dev`) e este SW continua a
 *  mandar: apaga as caches, desregista-se e recarrega as janelas — a página
 *  seguinte vem da rede e regista o SW certo. */
async function selfDestruct() {
    for (const key of await caches.keys()) {
        if (key.startsWith('oia-')) await caches.delete(key);
    }
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
}

// --- Ciclo de vida -------------------------------------------------------------

self.addEventListener('install', (event) => {
    // A versão nova assume logo (ver cabeçalho). No `next dev` (sem cache)
    // também: substitui de imediato uma casca de produção que tenha ficado.
    self.skipWaiting();
    if (!CACHE_ENABLED) return;
    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC_CACHE);
            // Só o essencial — o resto do build vem depois (`WARM`), sem atrasar
            // a troca de versão.
            await Promise.all(
                PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
            );
            const offline = await fetch(OFFLINE_URL).catch(() => null);
            if (isCacheableHtml(offline)) await storePage(self.location.origin + OFFLINE_URL, offline);
        })(),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            if (!CACHE_ENABLED) {
                // SW só-push: nenhuma cache da casca offline sobrevive.
                for (const key of await caches.keys()) {
                    if (key.startsWith('oia-')) await caches.delete(key);
                }
                await self.clients.claim();
                return;
            }
            const manifest = await serverBuild();
            if (isObsolete(manifest)) {
                await selfDestruct();
                return;
            }
            // Navigation preload: o pedido da página arranca em paralelo com o
            // arranque do SW (no Android, SW "frio" = centenas de ms a mais).
            if (self.registration.navigationPreload) {
                await self.registration.navigationPreload.enable().catch(() => undefined);
            }
            await pruneOldBuilds();
            await self.clients.claim();
            // O resto do build é guardado a pedido da app (`WARM`), fora do
            // `activate`: enquanto este não acaba, o browser segura as
            // navegações — guardar centenas de ficheiros aqui atrasava a app.
        })(),
    );
});

/** Mantém os estáticos deste build e do ANTERIOR (páginas ainda abertas nele
 *  continuam a conseguir carregar os seus ficheiros); apaga o resto e todas
 *  as cópias de HTML de outros builds. */
async function pruneOldBuilds() {
    const meta = await caches.open(META_CACHE);
    const stored = await meta.match('/__builds').then((r) => (r ? r.json() : [])).catch(() => []);
    const builds = [...stored.filter((b) => b !== BUILD), BUILD].slice(-2);
    await meta.put('/__builds', new Response(JSON.stringify(builds)));
    const keepStatic = new Set(builds.map((b) => `${STATIC_PREFIX}${b}`));
    for (const key of await caches.keys()) {
        if (key === META_CACHE) continue;
        if (key.startsWith(STATIC_PREFIX) && keepStatic.has(key)) continue;
        if (key === PAGES_CACHE) continue;
        if (key.startsWith('oia-')) await caches.delete(key);
    }
}

/** Guarda TODOS os estáticos do build (inclui chunks carregados sob demanda,
 *  que o HTML não referencia), em segundo plano e sem falhar tudo por um. */
async function warmStatics(manifest) {
    const cache = await caches.open(STATIC_CACHE);
    const assets = (manifest.assets || []).filter((a) => a.startsWith('/_next/static/'));
    for (let i = 0; i < assets.length; i += 6) {
        await Promise.all(
            assets.slice(i, i + 6).map(async (path) => {
                if (await cache.match(path)) return;
                try {
                    const res = await fetch(path);
                    if (res.ok) await cache.put(path, res);
                } catch {
                    // sem rede a meio — fica para a próxima visita
                }
            }),
        );
    }
}

self.addEventListener('message', (event) => {
    const data = event.data || {};
    // Compatibilidade: versões anteriores da app ainda pedem isto.
    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }
    // A app já está controlada por este SW: guarda o resto do build em
    // segundo plano (não bloqueia pedidos nenhuns).
    if (data.type === 'WARM' && CACHE_ENABLED) {
        event.waitUntil(serverBuild().then((manifest) => (manifest && !isObsolete(manifest) ? warmStatics(manifest) : undefined)));
        return;
    }
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

// Apaga as entradas mais antigas acima de `max` — nunca a página /offline.
async function trim(cacheName, max) {
    const cache = await caches.open(cacheName);
    const keys = (await cache.keys()).filter((req) => new URL(req.url).pathname !== OFFLINE_URL);
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

// Rede de segurança: a cada abertura (navegação completa), no máximo 1×/30 s,
// confirma que o servidor ainda corre este build. Um SW cujo `sw.js` não mudou
// nunca volta a instalar — sem isto, uma página velha (servida da cache)
// registava sempre o SW velho e nunca descobria o build novo.
let lastBuildCheck = 0;
function checkBuildInBackground(event) {
    const now = Date.now();
    if (now - lastBuildCheck < 30_000) return;
    lastBuildCheck = now;
    event.waitUntil(
        serverBuild().then((manifest) => (isObsolete(manifest) ? selfDestruct() : undefined)).catch(() => undefined),
    );
}

// Navegação (HTML): rede primeiro (com navigation preload), com limite. Se a
// rede demorar mais de NAV_TIMEOUT_MS e houver cópia deste URL (sempre do
// build ativo — as de outros builds são apagadas), mostra a cópia e a rede
// continua a atualizá-la. Sem rede: cópia deste URL → /offline.
async function handleNavigation(event) {
    checkBuildInBackground(event);
    const request = event.request;
    const cache = await caches.open(PAGES_CACHE);
    const url = new URL(request.url);
    const key = url.origin + url.pathname;

    const network = (async () => {
        const preloaded = await event.preloadResponse;
        const response = preloaded || (await fetch(request));
        if (isCacheableHtml(response)) event.waitUntil(storePage(key, response.clone()));
        return response;
    })();
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

// Estáticos com hash (`/_next/static`): nunca mudam → cache primeiro, em
// QUALQUER build guardado (uma página do build anterior ainda aberta encontra
// os seus ficheiros), senão rede.
async function handleImmutable(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
    }
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
        // Como a app e o SW sabem que build o servidor tem — nunca da cache
        // (antes caía na regra de `.json` e devolvia a resposta antiga).
        if (BYPASS.has(url.pathname)) return;
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
        if (/\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname) && !url.pathname.startsWith('/_next/')) {
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
