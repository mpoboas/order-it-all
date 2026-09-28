'use client';

/**
 * Recuperação da app — o que o pull-to-refresh usa para resolver QUALQUER
 * estado preso no instante a seguir.
 */

/** Build que este JS espera do servidor (em `next dev` a rota responde "dev"). */
const EXPECTED_BUILD =
    process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_BUILD_ID || '' : 'dev';

/** Build que o servidor está a correr, ou `null` sem rede/servidor. URL único
 *  a cada chamada: nenhuma cache (nem um service worker antigo, que guardava
 *  `.json`) pode responder por ele. */
async function fetchServerBuild(): Promise<string | null> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`/sw-manifest.json?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        const { buildId } = (await res.json()) as { buildId?: unknown };
        return typeof buildId === 'string' ? buildId : '';
    } catch {
        return null;
    }
}

/**
 * O JS que está a correr é de outro build que não o do servidor? (Service
 * worker antigo a servir a cópia de um build que já morreu — logo a seguir a
 * um deploy, ou com o `next dev` onde antes esteve um build de produção.)
 * Sem rede ou servidor que não sabe o seu build → `false`.
 */
export async function isRunningStaleBuild(): Promise<boolean> {
    const buildId = await fetchServerBuild();
    return !!buildId && EXPECTED_BUILD !== '' && buildId !== EXPECTED_BUILD;
}

/**
 * Recarrega a app vinda da REDE, sem nada pelo meio: desregista os service
 * workers e apaga as caches da casca offline antes de recarregar — um SW
 * antigo não pode voltar a servir a cópia velha (antes, "recarregar" com o
 * servidor lento > 3 s devolvia outra vez o HTML em cache). Os dados locais
 * (Dexie) e a sessão ficam. Sem servidor alcançável, recarrega normalmente
 * (a casca offline é então precisamente o que se quer).
 */
export async function hardReset(): Promise<void> {
    if (navigator.onLine && (await fetchServerBuild()) !== null) {
        try {
            const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
            await Promise.all(registrations.map((r) => r.unregister()));
            const keys = typeof caches !== 'undefined' ? await caches.keys() : [];
            await Promise.all(keys.filter((k) => k.startsWith('oia-')).map((k) => caches.delete(k)));
        } catch {
            // best-effort — recarrega na mesma
        }
    }
    window.location.reload();
}

/** Resolve `true` se `promise` acabar antes de `ms`, `false` se não. */
export function finishesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
    return Promise.race([
        promise.then(
            () => true,
            () => true,
        ),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
    ]);
}
