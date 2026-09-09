'use client';

import { useState } from 'react';
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
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { Avatar } from '@/components/ui/Avatar';
import { GroupMembersSheet } from '@/components/features/GroupMembersSheet';
import { useWebHaptics } from 'web-haptics/react';
import { usePrefetchOnIntent } from '@/hooks/usePrefetch';

const MAX_VISIBLE_AVATARS = 4;

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
  const [showMembers, setShowMembers] = useState(false);
  const memberCount = group.members?.length || 1;
  const memberUsers = group.expand?.members ?? [];
  const visibleMembers = memberUsers.slice(0, MAX_VISIBLE_AVATARS);
  const overflowMembers = memberCount - visibleMembers.length;
  const canViewMembers = memberUsers.length > 0;
  const avatarUrl = getGroupAvatarUrl(group.id, group.avatar);
  const emoji = guessGroupEmoji(group.avatar);
  const isCreator = Boolean(userId && group.creator === userId);
  const isAdmin = Boolean(
    userId && !isCreator && group.admins?.includes(userId)
  );

  const isGroupAdmin = Boolean(userId && group.admins?.includes(userId));
  const prefetch = usePrefetchOnIntent(
    `/groups/${group.id}/${isGroupAdmin ? 'admin' : 'trips'}`,
  );

  const openMembers = () => {
    trigger();
    setShowMembers(true);
  };

  return (
    <>
      <button
        type="button"
        {...prefetch}
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
          {!canViewMembers && (
            <EntityMetaItem icon="groups">
              {memberCount} {memberCount === 1 ? 'membro' : 'membros'}
            </EntityMetaItem>
          )}
          {group.created && (
            <EntityMetaItem icon="schedule">
              {getRelativeTime(group.created)}
            </EntityMetaItem>
          )}
        </div>

        {canViewMembers && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              openMembers();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                openMembers();
              }
            }}
            aria-label={`Ver ${memberCount} membros`}
            className="flex items-center gap-2 -mx-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-violet-50 active:scale-[0.99] dark:hover:bg-violet-900/20"
          >
            <span className="flex items-center shrink-0">
              {visibleMembers.map((member, index) => (
                <Avatar
                  key={member.id}
                  name={member.name}
                  src={getUserAvatarUrl(member.id, member.avatar)}
                  size="xs"
                  stacked
                  className={index > 0 ? '-ml-2' : undefined}
                />
              ))}
              {overflowMembers > 0 && (
                <span className="-ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-700 ring-2 ring-white dark:bg-violet-900/50 dark:text-violet-300 dark:ring-slate-800">
                  +{overflowMembers}
                </span>
              )}
            </span>
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
              Ver {memberCount} {memberCount === 1 ? 'membro' : 'membros'}
            </span>
            <span
              className="material-icons text-sm text-violet-400 shrink-0 dark:text-violet-500"
              aria-hidden
            >
              chevron_right
            </span>
          </span>
        )}

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

      <GroupMembersSheet
        isOpen={showMembers}
        onClose={() => setShowMembers(false)}
        group={group}
      />
    </>
  );
}
