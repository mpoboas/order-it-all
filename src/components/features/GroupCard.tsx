'use client';

import type { Group } from '@/lib/types';
import {
  getGroupAvatarUrl,
  guessGroupEmoji,
  isGroupImageAvatar,
} from '@/lib/groupAvatars';
import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';
import { usePrefetchOnIntent } from '@/hooks/usePrefetch';
import { Icon } from '@/components/ui/Icon';
import { Balance } from '@/components/ui/Balance';
import { groupHomeHref } from '@/lib/navHierarchy';

interface GroupCardProps {
  group: Group;
  /** Saldo líquido do utilizador neste grupo, em cêntimos. `undefined` enquanto carrega. */
  netCents?: number;
  onSelect: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/** Linha de grupo na lista do Início — mesmo formato simples da linha de
 *  amigo (`/people`): ícone, nome, saldo, seta. As restantes ações
 *  (membros, criador/admin) vivem agora no hero do detalhe do grupo
 *  (`HeroHeader`), não precisam de duplicar-se aqui. */
export function GroupCard({
  group,
  netCents,
  onSelect,
  className,
  style,
}: GroupCardProps) {
  const { trigger } = useWebHaptics();
  const avatarUrl = getGroupAvatarUrl(group.id, group.avatar);
  const emoji = guessGroupEmoji(group.avatar);

  const prefetch = usePrefetchOnIntent(groupHomeHref(group.id));

  return (
    <button
      type="button"
      {...prefetch}
      onClick={() => {
        trigger();
        onSelect();
      }}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors',
        className,
      )}
      style={style}
    >
      <div className="w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0 overflow-hidden">
        {avatarUrl && isGroupImageAvatar(group.avatar) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl leading-none">{emoji}</span>
        )}
      </div>
      <span className="flex-1 min-w-0 font-medium text-ink truncate">{group.name}</span>
      {typeof netCents === 'number' && (
        <Balance cents={netCents} labels={{ pos: 'devem-te', neg: 'deves' }} />
      )}
      <Icon name="chevron_right" className="text-ink-faint" />
    </button>
  );
}
