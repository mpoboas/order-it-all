'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** Folha de um só campo — adicionar uma pessoa sem conta ou mudar-lhe o nome. */
export function NameSheet({
    isOpen,
    onClose,
    title,
    description,
    initialValue = '',
    confirmLabel,
    validate,
    onSubmit,
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    initialValue?: string;
    confirmLabel: string;
    /** Mensagem de erro para mostrar no campo, ou `undefined` se está bom. */
    validate?: (name: string) => string | undefined;
    onSubmit: (name: string) => Promise<void>;
}) {
    const [value, setValue] = useState(initialValue);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) setValue(initialValue);
    }, [isOpen, initialValue]);

    const trimmed = value.trim();
    const error = trimmed ? validate?.(trimmed) : undefined;
    const canSubmit = !!trimmed && !error && trimmed !== initialValue.trim();

    const submit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        try {
            await onSubmit(trimmed);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="auto"
            footer={
                <Button size="lg" block loading={saving} disabled={!canSubmit} onClick={submit}>
                    {confirmLabel}
                </Button>
            }
        >
            <form
                className="space-y-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                {description && <p className="text-sm text-ink-soft">{description}</p>}
                <Input
                    label="Nome"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus
                    autoCapitalize="words"
                    maxLength={40}
                    placeholder="Ex.: Joana"
                    error={error}
                />
            </form>
        </Sheet>
    );
}
