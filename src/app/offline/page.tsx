'use client';

import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

/**
 * Servida pelo service worker quando não há rede e o ecrã pedido nunca foi
 * aberto neste dispositivo (não há cópia guardada). Pré-guardada ao instalar o
 * SW (`public/sw.js`). Navegação normal para `/groups` e não `useAppNavigate`:
 * sem rede, só um carregamento de página completo é servido pela cache.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-dvh bg-app flex flex-col items-center justify-center px-6 text-center safe-screen">
      <div className="w-16 h-16 rounded-full bg-warning-bg text-warning-fg flex items-center justify-center mb-5">
        <Icon name="cloud_off" size={30} />
      </div>
      <h1 className="text-xl font-bold text-ink mb-2">Sem ligação</h1>
      <p className="text-ink-soft max-w-xs mb-8">
        Este ecrã ainda não foi aberto neste dispositivo, por isso não há uma cópia guardada. Os ecrãs que já
        abriste continuam disponíveis só para consulta.
      </p>
      <div className="w-full max-w-xs space-y-3">
        <Button block onClick={() => window.location.reload()}>
          Tentar outra vez
        </Button>
        <Button block variant="ghost" onClick={() => window.location.assign('/groups')}>
          Ir para o início
        </Button>
      </div>
    </main>
  );
}
