import Image from 'next/image';
import { cn } from '@/lib/utils';

interface RemoteImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  unoptimized?: boolean;
}

/** External image with fixed dimensions (CLS-safe) and no referrer cookies. */
export function RemoteImage({
  src,
  alt,
  width,
  height,
  className,
  unoptimized,
}: RemoteImageProps) {
  const isStoreImage =
    src.includes('continente.pt') || src.includes('pingodoce.pt');

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={cn(className)}
      referrerPolicy="no-referrer"
      unoptimized={unoptimized ?? isStoreImage}
    />
  );
}
