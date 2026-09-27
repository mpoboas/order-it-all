'use client';

import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { IconName } from '@/components/ui/Icon';

/**
 * Substitui o `window.confirm()` nativo (cinzento, sem marca, sem tema) por um
 * diálogo próprio — mesma linguagem visual do `<Sheet>` (fundo, cantos,
 * spring), mas pequeno e sem chrome de navegação.
 *
 * `default`  → pergunta neutra (gerar, promover, reabrir).
 * `warning`  → reversível mas com efeito (terminar viagem, fechar divisão).
 * `danger`   → destrutivo/irreversível (eliminar, remover).
 */
export type ConfirmTone = 'default' | 'warning' | 'danger';

export interface ConfirmOptions {
  /** Pergunta curta e direta — não "Tens a certeza?" genérico. */
  title: string;
  /** Consequência, só quando não é óbvia pelo título. */
  description?: string;
  /** Rótulo específico do botão de confirmar (nunca "OK" genérico). */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Ícone próprio em vez do do tom (ex.: telemóvel para o MB WAY). */
  icon?: IconName;
  /** Bloco extra por baixo da descrição (ex.: número com botão "Copiar"). */
  content?: ReactNode;
  /** Confirmar é um link verdadeiro (`<a href>`) — para abrir outra app.
   *  No iOS só um toque direto num link abre a app por universal link (ex.:
   *  `revolut.me`); navegar por JS depois de um `await` abre o site. */
  confirmHref?: string;
}

interface ConfirmState extends Required<Pick<ConfirmOptions, 'title' | 'confirmLabel' | 'cancelLabel' | 'tone'>> {
  description?: string;
  icon?: IconName;
  content?: ReactNode;
  confirmHref?: string;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirmAction = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { title: options } : options;
    return new Promise<boolean>((resolve) => {
      setState({
        title: opts.title,
        description: opts.description,
        confirmLabel: opts.confirmLabel ?? 'Confirmar',
        cancelLabel: opts.cancelLabel ?? 'Cancelar',
        tone: opts.tone ?? 'default',
        icon: opts.icon,
        content: opts.content,
        confirmHref: opts.confirmHref,
      });
      setResolver(() => resolve);
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      resolver?.(value);
      setResolver(null);
      setState(null);
    },
    [resolver],
  );

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <ConfirmDialog
        open={state !== null}
        title={state?.title ?? ''}
        description={state?.description}
        confirmLabel={state?.confirmLabel ?? 'Confirmar'}
        cancelLabel={state?.cancelLabel ?? 'Cancelar'}
        tone={state?.tone ?? 'default'}
        icon={state?.icon}
        content={state?.content}
        confirmHref={state?.confirmHref}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

/** `const confirmAction = useConfirm(); if (!(await confirmAction({...}))) return;` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx;
}
