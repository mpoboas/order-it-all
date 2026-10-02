import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Faixa azul da marca por baixo do `<Header>` nos ecrãs principais (Início,
 * Amigos, Atividade, Perfil) — continua a barra do topo sem costura e dá a
 * cada ecrã uma "capa" com a saudação/título. Tokens `.on-brand` lá dentro
 * (texto branco). Ver `.brand-band` em `globals.css`.
 *
 * `overlap`: deixa espaço em baixo para o conteúdo seguinte subir por cima da
 * faixa (cartões "pousados" no azul — ex.: os mosaicos Devem-te/Deves).
 */
export function BrandBand({ children, overlap = false, className }: { children: ReactNode; overlap?: boolean; className?: string }) {
    return (
        <div className={cn('brand-band on-brand rounded-b-3xl', overlap ? 'pb-14' : 'pb-6', className)}>
            <div className="container mx-auto max-w-lg px-4 pt-3">{children}</div>
        </div>
    );
}
