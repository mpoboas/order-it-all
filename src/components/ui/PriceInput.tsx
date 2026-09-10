'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PRICE_PLACEHOLDER, formatPriceInput, parseEUR } from '@/lib/money';

type NativeInput = React.InputHTMLAttributes<HTMLInputElement>;

interface PriceInputProps
    extends Omit<NativeInput, 'value' | 'onChange' | 'type' | 'inputMode'> {
    /** Valor em euros. */
    value: number;
    /** Chamado a cada tecla com o número já interpretado. */
    onValueChange: (value: number) => void;
}

/**
 * Campo de preço em pt-PT. `type="text"` + `inputMode="decimal"` — aceita
 * vírgula **ou** ponto, o `type="number"` nativo não deixava escrever vírgula e
 * obrigava a UI a mostrar `0.00` enquanto tudo o resto mostra `0,00 €`.
 * Enquanto o campo tem foco mostra o que o utilizador escreve; ao sair
 * normaliza para `1234,50`.
 */
export function PriceInput({
    value,
    onValueChange,
    className,
    placeholder = PRICE_PLACEHOLDER,
    onFocus,
    onBlur,
    ...rest
}: PriceInputProps) {
    const [focused, setFocused] = useState(false);
    const [text, setText] = useState(() => formatPriceInput(value));

    // Puxa um valor de fora (reset, resposta do servidor) só quando o campo não
    // está a ser editado — senão lutava com o que o utilizador escreve. Padrão
    // "ajustar estado ao mudar uma prop" (setState durante o render, com guarda
    // de valor anterior — não faz loop).
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue && !focused) {
        setLastValue(value);
        setText(formatPriceInput(value));
    }

    return (
        <input
            {...rest}
            type="text"
            inputMode="decimal"
            value={text}
            placeholder={placeholder}
            className={cn('tabular-nums', className)}
            onFocus={(e) => {
                setFocused(true);
                onFocus?.(e);
            }}
            onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, '');
                setText(raw);
                onValueChange(parseEUR(raw));
            }}
            onBlur={(e) => {
                setFocused(false);
                onBlur?.(e);
            }}
        />
    );
}
