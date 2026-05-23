'use client';

import type { Group } from '@/lib/types';
import {
  entityListCardClassName,
  EntityCardDivider,
  EntityCardFooter,
  EntityMetaItem,
  EntityCardTitle,
  EntityStatusPill,
} from '@/components/ui/EntityListCard';
import {
  getGroupAvatarUrl,
  guessGroupEmoji,
  isGroupImageAvatar,
} from '@/lib/groupAvatars';
import { getRelativeTime, cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';

interface GroupCardProps {
  group: Group;
  userId?: string;
  onSelect: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function GroupCard({
  group,
  userId,
  onSelect,
  className,
  style,
}: GroupCardProps) {
  const { trigger } = useWebHaptics();
  const memberCount = group.members?.length || 1;
  const avatarUrl = getGroupAvatarUrl(group.id, group.avatar);
  const emoji = guessGroupEmoji(group.avatar);
  const isCreator = Boolean(userId && group.creator === userId);
  const isAdmin = Boolean(
    userId && !isCreator && group.admins?.includes(userId)
  );

  return (
    <button
      type="button"
      onClick={() => {
        trigger();
        onSelect();
      }}
      className={cn(entityListCardClassName, className)}
      style={style}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {avatarUrl && isGroupImageAvatar(group.avatar) ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl leading-none">{emoji}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 flex items-center">
          <EntityCardTitle className="text-xl leading-tight">
            {group.name}
          </EntityCardTitle>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <EntityMetaItem icon="groups">
          {memberCount} {memberCount === 1 ? 'membro' : 'membros'}
        </EntityMetaItem>
        {group.created && (
          <EntityMetaItem icon="schedule">
            {getRelativeTime(group.created)}
          </EntityMetaItem>
        )}
      </div>

      <EntityCardDivider />

      <EntityCardFooter
        left={
          isCreator ? (
            <EntityStatusPill variant="creator">Criador</EntityStatusPill>
          ) : isAdmin ? (
            <EntityStatusPill variant="admin">Admin</EntityStatusPill>
          ) : null
        }
      />
    </button>
  );
}
