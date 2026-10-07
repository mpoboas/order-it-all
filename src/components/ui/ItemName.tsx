import { splitItemName } from '@/lib/itemName';

interface ItemNameProps {
  name: string;
  /** Texto quando o nome está vazio (ex.: "Item sem nome"). */
  fallback?: string;
  /** Quando o elemento pai trunca numa linha (`truncate`), trunca título e subtítulo em separado. */
  truncate?: boolean;
}

/**
 * Nome de item com o original do talão como subtítulo: "Cebola (ZWIEBEL)" →
 * "Cebola" e, por baixo, "ZWIEBEL" pequeno e esbatido. Vai DENTRO do elemento
 * de título existente (herda peso/cor); sem original, rende só o texto.
 */
export function ItemName({ name, fallback = '', truncate = false }: ItemNameProps) {
  const { title, original } = splitItemName(name);
  if (!original) return <>{title || fallback}</>;
  return (
    <>
      <span className={truncate ? 'block truncate' : 'block'}>{title}</span>
      <span
        className={`block text-xs font-normal text-ink-faint leading-snug ${truncate ? 'truncate' : 'break-words'}`}
      >
        {original}
      </span>
    </>
  );
}
