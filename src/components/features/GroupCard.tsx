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
import { formatRelativeOrDate, cn } from '@/lib/utils';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { Avatar } from '@/components/ui/Avatar';
import { GroupMembersSheet } from '@/components/features/GroupMembersSheet';
import { useWebHaptics } from 'web-haptics/react';
import { usePrefetchOnIntent } from '@/hooks/usePrefetch';
import { Icon } from '@/components/ui/Icon';

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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-100 dark:from-primary-900/40 dark:to-primary-900/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
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
              {formatRelativeOrDate(group.created)}
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
            // Não deixar o toque/hover chegar ao card — senão dispara o
            // `router.prefetch({ kind: 'full' })` do card (RSC completo) no
            // mesmo gesto de abrir o sheet, e este "laga".
            onPointerEnter={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
            aria-label={`Ver ${memberCount} membros`}
            className="inline-flex self-start items-center gap-2 -mx-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-primary-50 active:scale-[0.99] dark:hover:bg-primary-900/20"
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
                <span className="-ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[9px] font-bold text-primary-700 ring-2 ring-white dark:bg-primary-900/50 dark:text-primary-300 dark:ring-slate-800">
                  +{overflowMembers}
                </span>
              )}
            </span>
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
              Ver {memberCount} {memberCount === 1 ? 'membro' : 'membros'}
            </span>
            <Icon name="chevron_right" className="-ml-1 text-base text-primary-400 shrink-0 dark:text-primary-500" />
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
