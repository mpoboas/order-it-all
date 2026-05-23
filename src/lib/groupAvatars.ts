export const GROUP_EMOJIS = [
  '👥',
  '🏠',
  '🏡',
  '🏢',
  '👨‍👩‍👧‍👦',
  '🎉',
  '⚽',
  '🍻',
  '🍕',
  '✈️',
  '🛒',
  '🎮',
  '📚',
  '💼',
] as const;

/** PocketBase stores uploaded avatars as filenames; short strings are legacy emojis. */
export function isGroupImageAvatar(avatar?: string): boolean {
  return Boolean(avatar && avatar.length > 2 && !GROUP_EMOJIS.includes(avatar as (typeof GROUP_EMOJIS)[number]));
}

export function getGroupAvatarUrl(groupId: string, avatar?: string): string | null {
  if (!avatar || !isGroupImageAvatar(avatar)) return null;
  const base =
    process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';
  return `${base}/api/files/groups/${groupId}/${avatar}`;
}

export function guessGroupEmoji(avatar?: string): string {
  if (avatar && GROUP_EMOJIS.includes(avatar as (typeof GROUP_EMOJIS)[number])) {
    return avatar;
  }
  return '👥';
}
