export type NormalizedItemBrand = 'official' | 'off-brand' | 'other' | 'unset';

export function normalizeItemBrand(brand?: string): NormalizedItemBrand {
  const raw = brand?.trim();
  if (!raw) return 'unset';
  const b = raw.toLowerCase();
  if (b.includes('official')) return 'official';
  if (
    b.includes('off-brand') ||
    b.includes('white') ||
    b.includes('branca') ||
    b.includes('marca branca')
  ) {
    return 'off-brand';
  }
  return 'other';
}

export function getItemBrandLabel(brand?: string): string {
  switch (normalizeItemBrand(brand)) {
    case 'official':
      return 'Marca original';
    case 'off-brand':
      return 'Marca branca';
    case 'other':
      return brand!.trim();
    default:
      return 'Marca?';
  }
}
