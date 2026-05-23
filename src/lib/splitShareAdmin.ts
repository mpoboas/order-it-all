import PocketBase from 'pocketbase';
import type { Split, SplitItem } from '@/lib/types';
import { normalizeSplitRecord } from '@/lib/splitStatus';

const pb = new PocketBase(
  process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top'
);

export function escapeShareCode(code: string): string {
  return code.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeItems(items: unknown): SplitItem[] {
  if (Array.isArray(items)) return items as SplitItem[];
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeSplit(record: Split): Split {
  return normalizeSplitRecord({
    ...record,
    participants: Array.isArray(record.participants) ? record.participants : [],
    items: normalizeItems(record.items),
  });
}

/** Public PocketBase rules allow read when share_active + share_code match. */
export async function getActiveSplitByShareCode(
  shareCode: string
): Promise<Split | null> {
  try {
    const record = await pb.collection('splits').getFirstListItem<Split>(
      `share_code = "${escapeShareCode(shareCode)}" && share_active = true`
    );
    return normalizeSplit(record);
  } catch {
    return null;
  }
}

export async function updateSplitItems(
  splitId: string,
  items: Split['items']
): Promise<Split> {
  const record = await pb.collection('splits').update<Split>(splitId, { items });
  return normalizeSplit(record);
}
