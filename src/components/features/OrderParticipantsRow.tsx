import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import {
  getOrderAudienceShortLabel,
  inferAudienceType,
  getUserAvatarUrl,
  resolveOrderParticipants,
} from '@/lib/orderParticipants';
import { Icon } from '@/components/ui/Icon';

const MAX_VISIBLE_AVATARS = 4;

interface OrderParticipantsRowProps {
  participantIds: string[];
  members: User[];
  /** Whose perspective labels use (defaults to currentUserId) — e.g. order creator on admin */
  perspectiveUserId?: string;
  currentUserId: string;
  expandedParticipants?: User[];
  onClick?: () => void;
  /** Admin: always open sheet, including solo-participant orders */
  alwaysClickable?: boolean;
  /** Admin: "Só para {name}" instead of "Só para ti" */
  namedPerspective?: boolean;
  className?: string;
}

export function OrderParticipantsRow({
  participantIds,
  members,
  perspectiveUserId,
  currentUserId,
  expandedParticipants,
  onClick,
  alwaysClickable = false,
  namedPerspective = false,
  className,
}: OrderParticipantsRowProps) {
  if (!participantIds.length) return null;

  const users = resolveOrderParticipants(participantIds, members, expandedParticipants);
  if (!users.length) return null;

  const labelUserId = perspectiveUserId ?? currentUserId;
  const label = getOrderAudienceShortLabel(participantIds, members, labelUserId, undefined, {
    namedPerspective,
  });
  const audienceType = inferAudienceType(participantIds, members, labelUserId);
  const canOpenSheet =
    Boolean(onClick) && (alwaysClickable || audienceType !== 'me');
  const visible = users.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = users.length - visible.length;

  const content = (
    <>
      <div className="flex items-center shrink-0">
        {visible.map((user, index) => (
          <Avatar
            key={user.id}
            name={user.name}
            src={getUserAvatarUrl(user.id, user.avatar)}
            size="xs"
            stacked
            className={index > 0 ? '-ml-2' : undefined}
          />
        ))}
        {overflow > 0 && (
          <span
            className={cn(
              'w-5 h-5 -ml-2 rounded-full flex items-center justify-center',
              'bg-primary-100 dark:bg-primary-900/50 text-[9px] font-bold text-primary-700 dark:text-primary-300',
              'ring-2 ring-white dark:ring-slate-800'
            )}
          >
            +{overflow}
          </span>
        )}
      </div>
      <span className="text-[10px] font-semibold text-primary-600 dark:text-primary-400 leading-tight shrink-0">
        {label}
      </span>
      {canOpenSheet && (
        <Icon name="chevron_right" className="-ml-1 text-base text-primary-400 dark:text-primary-500 shrink-0" />
      )}
    </>
  );

  const rowClass = cn(
    'flex items-center gap-2 mt-1.5 min-w-0 max-w-full',
    canOpenSheet &&
      'cursor-pointer rounded-lg -mx-1 px-1 py-0.5 hover:bg-primary-50 dark:hover:bg-primary-900/20 active:scale-[0.99] transition-colors',
    className
  );

  if (canOpenSheet) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(rowClass, 'text-left')}
        aria-label={`Ver participantes: ${label}`}
      >
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
}
