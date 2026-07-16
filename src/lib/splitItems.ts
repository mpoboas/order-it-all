import type { SplitItem } from '@/lib/types';

export function itemHasAllParticipants(
  item: Pick<SplitItem, 'participants'>,
  allParticipants: string[]
): boolean {
  if (allParticipants.length === 0) return false;
  const selected = new Set(item.participants);
  return allParticipants.every((p) => selected.has(p));
}

export function isItemLocked(item: SplitItem): boolean {
  return item.locked === true;
}

/** After participant changes: lock when everyone is on the item, unlock otherwise. */
export function reconcileItemLock(
  item: SplitItem,
  allParticipants: string[]
): SplitItem {
  return {
    ...item,
    locked: itemHasAllParticipants(item, allParticipants),
  };
}

export function reconcileSplitItems(
  items: SplitItem[],
  allParticipants: string[]
): SplitItem[] {
  return items.map((item) => reconcileItemLock(item, allParticipants));
}

export function setItemLocked(item: SplitItem, locked: boolean): SplitItem {
  return { ...item, locked };
}

export function canParticipantLeaveItem(item: SplitItem, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return !isItemLocked(item);
}

export function cloneSplitItem(item: SplitItem): SplitItem {
  return {
    ...item,
    participants: [...item.participants],
    locked: item.locked === true,
    allocations: item.allocations ? { ...item.allocations } : undefined,
  };
}

export function cloneSplitItems(items: SplitItem[]): SplitItem[] {
  return items.map(cloneSplitItem);
}

export function shouldConfirmRemoveItem(item: SplitItem): boolean {
  return item.price > 0 || item.participants.length > 0;
}

export function getRemoveItemConfirmMessage(item: SplitItem): string {
  const label = item.name?.trim() ? `"${item.name.trim()}"` : 'este item';
  const details: string[] = [];
  if (item.price > 0) details.push('preço definido');
  if (item.participants.length > 0) {
    details.push(
      `${item.participants.length} participante${item.participants.length === 1 ? '' : 's'}`
    );
  }
  return `Remover ${label}? Tem ${details.join(' e ')}.`;
}
