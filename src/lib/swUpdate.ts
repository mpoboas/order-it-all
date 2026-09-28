'use client';

/**
 * Atualizações do service worker — padrão "immediate update" (Workbox,
 * web.dev "Handling service worker updates"), com a troca de página feita
 * num momento seguro.
 *
 * O SW novo assume sozinho (`skipWaiting` + `clients.claim` em `public/sw.js`)
 * — numa WPA do Android a janela nunca fecha de verdade, e a espera por
 * defeito deixava a app presa num build antigo até ir para segundo plano
 * ("abrir no browser e voltar" era o que a destravava). O SW guarda os
 * estáticos do build anterior, por isso a página que já estava aberta continua
 * a funcionar; aqui decide-se QUANDO ela passa para a versão nova:
 *  - logo, se a app estiver escondida ou acabada de abrir;
 *  - senão, na próxima vez que for para segundo plano (nunca a meio do uso).
 *
 * Também: procura versão nova ao arrancar e sempre que a app volta ao 1.º
 * plano (máx. 1×/min), e pede ao SW para guardar o resto do build (`WARM`).
 */

const CHECK_THROTTLE_MS = 60_000;
/** Até quando depois de abrir ainda é "a arrancar" (seguro recarregar). */
const STARTUP_WINDOW_MS = 5_000;

export function manageServiceWorkerUpdates(registration: ServiceWorkerRegistration): () => void {
    const startedAt = Date.now();
    let lastCheck = 0;
    let reloadPending = false;
    let reloading = false;
    // 1.ª visita: o SW instala e faz `clients.claim()`, o que também dispara
    // `controllerchange` — aí não há versão antiga a trocar.
    let hadController = !!navigator.serviceWorker.controller;

    const warm = () => navigator.serviceWorker.controller?.postMessage({ type: 'WARM' });

    const reload = () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
    };

    const check = () => {
        const now = Date.now();
        if (now - lastCheck < CHECK_THROTTLE_MS) return;
        lastCheck = now;
        registration.update().catch(() => undefined);
    };

    const onControllerChange = () => {
        warm();
        if (!hadController) {
            hadController = true;
            return;
        }
        if (document.visibilityState === 'hidden' || Date.now() - startedAt < STARTUP_WINDOW_MS) reload();
        else reloadPending = true;
    };

    const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
            if (reloadPending) reload();
            // Versões antigas do SW ainda esperam pelo pedido.
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        } else {
            check();
        }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisibility);

    // Uma versão antiga do SW pode ter ficado à espera — a app acabou de abrir.
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    warm();
    check();

    return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        document.removeEventListener('visibilitychange', onVisibility);
    };
}
