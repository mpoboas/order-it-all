'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/Avatar';
import type { Party } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SplitParticipantNameInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Escolheu um membro ou um placeholder já existente no grupo. */
  onSelectExisting: (partyId: string) => void;
  /** Escreveu um nome que não corresponde a ninguém — o pai cria um placeholder novo. */
  onAddNew: (name: string) => void;
  /** Partes do grupo ainda não na divisão (membros + placeholders). */
  candidates: Party[];
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}

export function SplitParticipantNameInput({
  value,
  onChange,
  onSelectExisting,
  onAddNew,
  candidates,
  placeholder = 'Introduz um nome...',
  inputRef,
  className,
}: SplitParticipantNameInputProps) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    return candidates.filter((party) => {
      const name = party.name.toLowerCase();
      const email = (party.email || '').toLowerCase();
      if (!query) return true;
      return name.includes(query) || email.includes(query);
    });
  }, [candidates, value]);

  const updateMenuPosition = useCallback(() => {
    const el = inputRef?.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [inputRef]);

  useLayoutEffect(() => {
    if (!open || matches.length === 0) {
      setMenuRect(null);
      return;
    }
    updateMenuPosition();
  }, [open, matches.length, value, updateMenuPosition]);

  useEffect(() => {
    if (!open || matches.length === 0) return;

    const handleReposition = () => updateMenuPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, matches.length, updateMenuPosition]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const exact = candidates.find(
      (party) => party.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exact) {
      onSelectExisting(exact.id);
    } else {
      onAddNew(trimmed);
    }
    setOpen(false);
  };

  const selectCandidate = (party: Party) => {
    onSelectExisting(party.id);
    setOpen(false);
  };

  const showMenu = open && matches.length > 0 && menuRect;

  const menu =
    showMenu && typeof document !== 'undefined'
      ? createPortal(
          <ul
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-xl overflow-y-auto max-h-[min(40dvh,240px)] py-1"
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 300,
            }}
            role="listbox"
          >
            {matches.map((party) => (
              <li key={party.id} role="option">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectCandidate(party)}
                  className="w-full text-left px-3 py-2.5 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-2.5"
                >
                  <Avatar name={party.name} src={party.avatar} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-medium text-[var(--text-primary)] truncate">
                      {party.name}
                    </span>
                    {party.kind === 'user' && party.email && (
                      <span className="block text-xs text-[var(--text-muted)] truncate">
                        {party.email}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )
      : null;

  return (
    <>
      <div className={cn('relative flex gap-2 items-start', className)}>
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className="w-full h-11 px-3 text-base rounded-xl border border-hairline bg-surface-sunken text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={Boolean(showMenu)}
          />
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          disabled={!value.trim()}
          className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-primary-600 text-white font-bold text-lg disabled:opacity-40 active:scale-95 transition"
          aria-label="Adicionar participante"
        >
          +
        </button>
      </div>
      {menu}
    </>
  );
}
