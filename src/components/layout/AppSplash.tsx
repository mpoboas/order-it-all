/**
 * Ecrã de arranque da app — o que o HTML do servidor mostra enquanto o JS
 * carrega e a sessão é lida (o `UserProvider` ainda não pode decidir o que
 * pintar). É preciso em todas as plataformas: o Android esconde o splash dele
 * assim que a página pinta, e sem isto ficava um ecrã vazio até a app chegar.
 *
 * Por isso é uma CÓPIA do splash do Android (WPA instalada): o mesmo fundo
 * sólido (`background_color` do manifest = primary-600), o mesmo ícone
 * recortável (`icon-maskable`) com o mesmo recorte arredondado e o mesmo
 * tamanho. A passagem de um para o outro não se nota. No iPhone, que não tem
 * splash próprio, é este que se vê. Sem JS, sem estado: pinta no 1.º frame.
 */
export function AppSplash() {
    return (
        <div aria-hidden data-app-splash className="brand-page fixed inset-0 z-[200] bg-primary-600 flex items-center justify-center">
            {/* Topo da cor do fundo (barra de estado do iPhone) — também no tema
                escuro, em que a cor da marca escurece mas o splash não. */}
            <div className="brand-top-edge" style={{ backgroundColor: 'var(--primary-600)' }} />
            {/* O Android amplia um pouco o ícone recortável dentro do recorte
                (os mirtilos ocupam ~55% do quadrado): a mesma ampliação aqui. */}
            <div className="w-[57vw] max-w-60 aspect-square rounded-[32%] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática, tem de pintar já */}
                <img src="/icon-maskable-512x512.png" alt="" width={512} height={512} className="w-full h-full scale-[1.12]" />
            </div>
        </div>
    );
}
