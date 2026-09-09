import { cn } from '@/lib/utils';

interface RemoteImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  /** Ignorado — mantido por compatibilidade com chamadas antigas. */
  unoptimized?: boolean;
}

/**
 * Imagem externa com dimensões fixas (CLS-safe) e sem enviar referrer.
 *
 * Usa `<img>` em vez de `next/image` de propósito: as imagens de produto vêm de
 * um agregador (supersave.pt) e podem estar em qualquer CDN de retalhista
 * (Continente, Pingo Doce, Auchan, …). Manter uma allowlist de hostnames em
 * `next.config.ts` era frágil e rebentava a página inteira quando aparecia um
 * host novo. Estas imagens já eram servidas com `unoptimized`, por isso não se
 * perde optimização nenhuma.
 */
export function RemoteImage({
  src,
  alt,
  width,
  height,
  className,
}: RemoteImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn(className)}
    />
  );
}
