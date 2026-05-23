import type { Split, SplitStatus } from '@/lib/types';

export function normalizeSplitStatus(
  split: Pick<Split, 'status' | 'splitwise_exported_at'>
): SplitStatus {
  if (split.status === 'closed' || split.status === 'open') {
    return split.status;
  }
  if (split.splitwise_exported_at) {
    return 'closed';
  }
  return 'open';
}

export function normalizeSplitRecord(split: Split): Split {
  return {
    ...split,
    status: normalizeSplitStatus(split),
  };
}

export function isSplitClosed(
  split: Pick<Split, 'status' | 'splitwise_exported_at'>
): boolean {
  return normalizeSplitStatus(split) === 'closed';
}

export function canMembersEditSplit(
  split: Pick<Split, 'status' | 'splitwise_exported_at'>
): boolean {
  return !isSplitClosed(split);
}

export function closeSplitPayload(): Pick<Split, 'status' | 'share_active'> {
  return { status: 'closed', share_active: false };
}

export function openSplitPayload(): Pick<Split, 'status'> {
  return { status: 'open' };
}
