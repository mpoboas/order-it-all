'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useWebHaptics } from 'web-haptics/react';
import { cn } from '@/lib/utils';
import { sheetSpring, sheetEase } from '@/lib/motion';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import type { ConfirmTone } from '@/context/ConfirmContext';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE: Record<ConfirmTone, { icon: IconName; iconBg: string; iconFg: string }> = {
  default: { icon: 'help_outline', iconBg: 'bg-info-bg', iconFg: 'text-info-fg' },
  warning: { icon: 'warning', iconBg: 'bg-warning-bg', iconFg: 'text-warning-fg' },
  danger: { icon: 'warning', iconBg: 'bg-danger-bg', iconFg: 'text-danger-fg' },
};

/**
 * Substituto do `window.confirm()` — mesma linguagem visual do `<Sheet>`
 * (portal, backdrop, cantos, spring) mas pequeno e sem chrome de navegação:
 * ícone de tom, pergunta, consequência opcional, dois botões.
 *
 * Cancelar vem primeiro e recebe o foco inicial — a opção segura por omissão,
 * para não confirmar sem querer com Enter/toque duplo (convenção de dialogs
 * destrutivos: nunca o botão perigoso pré-selecionado).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);
  const reduceMotion = useReducedMotion();
  const { trigger } = useWebHaptics();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const backdropTransition = reduceMotion ? { duration: 0.01 } : sheetEase;
  const panelTransition = reduceMotion ? { duration: 0.01 } : sheetSpring;
  const t = TONE[tone];

  const handleCancel = () => {
    trigger();
    onCancel();
  };
  const handleConfirm = () => {
    trigger(tone === 'danger' ? 'error' : undefined);
    onConfirm();
  };

  const tree = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-end sm:p-4 pointer-events-none">
          <motion.div
            className="absolute inset-0 bg-black/50 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
            onClick={handleCancel}
          />

          <motion.div
            className="relative w-full max-w-sm flex flex-col bg-surface rounded-t-[28px] sm:rounded-[24px] shadow-2xl pointer-events-auto p-6 pb-[calc(1.5rem+var(--safe-bottom))] sm:pb-6"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby={description ? 'confirm-dialog-desc' : undefined}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={panelTransition}
          >
            <div className="w-10 h-1 bg-hairline-strong rounded-full mx-auto mb-5 sm:hidden" />

            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center mb-4', t.iconBg, t.iconFg)}>
              <Icon name={t.icon} className="text-2xl" />
            </div>

            <h2 id="confirm-dialog-title" className="text-lg font-bold text-ink leading-snug">
              {title}
            </h2>
            {description && (
              <p id="confirm-dialog-desc" className="text-sm text-ink-soft mt-2 leading-relaxed">
                {description}
              </p>
            )}

            {/* Empilhados a toda a largura — lado a lado com rótulos específicos
                ("Remover privilégios", "Continuar a editar") meio-a-meio
                obrigava a texto a quebrar linha dentro do botão. Confirmar em
                cima (o que vieste fazer); Cancelar em baixo — mais perto do
                polegar, e é onde o foco inicial pousa por omissão. */}
            <div className="flex flex-col gap-2 mt-6">
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} block onClick={handleConfirm}>
                {confirmLabel}
              </Button>
              {/* Foco inicial na opção segura (Cancelar), nunca na perigosa —
                  convenção de diálogos destrutivos. */}
              <Button variant="ghost" block onClick={handleCancel} autoFocus>
                {cancelLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(tree, document.body);
}
