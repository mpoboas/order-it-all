interface StatusBarTintProps {
    /** Qualquer valor válido de `background` CSS — cor sólida ou gradiente,
     *  a mesma coisa que está mesmo por baixo, para a faixa ficar contínua. */
    background: string;
}

/** Tapa a faixa de blur que o iOS/iPadOS 27 (beta) pinta por cima do topo de
 *  uma WPA instalada, com uma cor sólida igual à do ecrã por baixo — em vez
 *  de a app tentar "apagar" a faixa (impossível, é o WebKit que a pinta,
 *  não nós), disfarça-a: o sistema borra uma faixa uniforme em vez de
 *  conteúdo real, o que não se nota. Sem efeito nenhum fora desse caso
 *  muito específico (WPA instalada + `.is-ios` no `<html>`, posto por um
 *  script no `layout.tsx` — ver `globals.css`, regra `.status-bar-tint`). */
export function StatusBarTint({ background }: StatusBarTintProps) {
    return <div aria-hidden className="status-bar-tint" style={{ background }} />;
}
