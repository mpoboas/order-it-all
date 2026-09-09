import type { Split, SplitStatus } from '@/lib/types';

export function normalizeSplitStatus(
  split: Pick<Split, 'status'>
): SplitStatus {
  return split.status === 'closed' ? 'closed' : 'open';
}

export function normalizeSplitRecord(split: Split): Split {
  return {
    ...split,
    status: normalizeSplitStatus(split),
  };
}

export function isSplitClosed(
  split: Pick<Split, 'status'>
): boolean {
  return normalizeSplitStatus(split) === 'closed';
}

export function canMembersEditSplit(
  split: Pick<Split, 'status'>
): boolean {
  return !isSplitClosed(split);
}

export function closeSplitPayload(): Pick<Split, 'status' | 'share_active'> {
  return { status: 'closed', share_active: false };
}

export function openSplitPayload(): Pick<Split, 'status'> {
  return { status: 'open' };
}
