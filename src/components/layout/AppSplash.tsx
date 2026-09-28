/**
 * Ecrã de arranque da app — o que o HTML do servidor mostra enquanto o JS
 * carrega e a sessão é lida (o `UserProvider` ainda não pode decidir o que
 * pintar). Antes era uma página vazia, no fundo claro: a WPA abria com o
 * splash do Android (`background_color` do manifest) e piscava a branco antes
 * de chegar à barra azul. Agora é o mesmo azul da marca, com o ícone — uma
 * continuação do splash do sistema. Sem JS, sem estado: pinta no 1.º frame.
 */
export function AppSplash() {
    return (
        <div aria-hidden data-app-splash className="brand-page fixed inset-0 z-[200] gradient-mesh flex items-center justify-center">
            <div className="brand-top-edge" />
            <div className="glass-card w-24 h-24 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático, tem de pintar já */}
                <img src="/favicon.svg" alt="" width={64} height={64} className="w-16 h-16 drop-shadow-lg" />
            </div>
        </div>
    );
}
