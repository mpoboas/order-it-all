'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';

interface EditFieldSheetProps {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  prefix?: string;
  type?: 'text' | 'tel';
  helper?: React.ReactNode;
  /** Devolve uma mensagem de erro, ou `null` se o valor for válido. */
  validate?: (value: string) => string | null;
  /** Mensagem a mostrar quando `onSave` rejeita — por omissão, uma genérica. */
  parseError?: (err: unknown) => string;
}

/** Ecrã "dinâmico" de campo único (Fase 9) — para as edições simples do
 *  Perfil (nome, username, MB WAY, chave API): um `<Sheet size="full">`
 *  genérico, reutilizado nos quatro casos em vez de um sheet bespoke por
 *  campo. Substitui o padrão anterior de linha sempre editável + "Guardar"
 *  inline em `src/app/profile/page.tsx`. */
export function EditFieldSheet({
  isOpen, onClose, label, value, onSave, placeholder, prefix, type = 'text', helper, validate, parseError,
}: EditFieldSheetProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Só ao ABRIR — não a cada mudança de `value` enquanto aberto. Um
    // `updateProfile` falhado reverte o valor otimista no contexto, o que
    // mudaria `value` a meio da edição e apagava o erro/rascunho em curso.
    if (isOpen) {
      setDraft(value);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    const validationError = validate?.(trimmed) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(parseError ? parseError(err) : 'Erro ao guardar. Tenta outra vez.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={label}
      size="full"
      footer={
        <Button block loading={saving} disabled={draft.trim() === value} onClick={handleSave}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-3 px-1 pt-2">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-hairline focus-within:border-primary-500 bg-surface-sunken">
          {prefix && <span className="text-ink-faint shrink-0">{prefix}</span>}
          <input
            type={type}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder={placeholder}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            name="field-value"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            className="w-full min-w-0 bg-transparent text-ink text-lg placeholder:text-ink-faint"
            // A regra global `input:focus-visible { outline: ... }`
            // (globals.css) vive fora de qualquer `@layer` — por cascade
            // layers isso ganha sempre a QUALQUER classe Tailwind, seja
            // qual for a especificidade. Só um `style` inline consegue
            // mesmo ganhar. O contorno da pill (`focus-within` no wrapper)
            // já basta como indicador de foco.
            style={{ outline: 'none' }}
          />
        </div>
        {error && <p className="text-sm text-danger-fg px-1">{error}</p>}
        {helper && <p className="text-sm text-ink-faint px-1">{helper}</p>}
      </div>
    </Sheet>
  );
}
