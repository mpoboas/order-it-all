import { NextResponse } from 'next/server';
import {
  getActiveSplitByShareCode,
  updateSplitItems,
} from '@/lib/splitShareAdmin';
import {
  toPublicSplitPayload,
  toggleItemParticipant,
  type PublicSplitPayload,
} from '@/lib/splitShare';
import {
  canMemberSaveAllocation,
  getAllowedMemberModes,
  getSplitItemMode,
  mergeMemberItemAllocation,
} from '@/lib/splitItemAllocation';
import {
  reconcileSplitItems,
  reconcileItemLock,
  isItemLocked,
} from '@/lib/splitItems';
import { isSplitClosed } from '@/lib/splitStatus';
import type { SplitItemMode } from '@/lib/types';
import { withLock } from '@/lib/serverMutex';

const SHARE_CODE_RE = /^[A-Za-z0-9]{6,12}$/;

type PatchOutcome =
  | { status: 200; body: PublicSplitPayload }
  | { status: 400 | 403 | 404; body: { error: string } };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    if (!SHARE_CODE_RE.test(shareCode)) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    const split = await getActiveSplitByShareCode(shareCode);
    if (!split) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(toPublicSplitPayload(split));
  } catch (error) {
    console.error('Split share GET error:', error);
    if ((error as Error).message === 'Server misconfiguration') {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    if (!SHARE_CODE_RE.test(shareCode)) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    const body = await request.json();
    const participantName =
      typeof body.participantName === 'string' ? body.participantName.trim() : '';
    const itemIndex =
      typeof body.itemIndex === 'number' ? body.itemIndex : Number(body.itemIndex);
    const include = body.include === true;
    const memberAllocation = body.memberAllocation as
      | {
          mode?: SplitItemMode;
          equalParticipating?: boolean;
          myValue?: number;
          allocations?: Record<string, number>;
          participants?: string[];
        }
      | undefined;

    if (!participantName || !Number.isInteger(itemIndex) || itemIndex < 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const hasToggle = body.include !== undefined;
    const hasMemberAllocation =
      memberAllocation &&
      typeof memberAllocation.mode === 'string' &&
      ['equal', 'unequal', 'shares'].includes(memberAllocation.mode);

    if (!hasToggle && !hasMemberAllocation) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (hasToggle && hasMemberAllocation) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Serialize concurrent toggles for the same split. Inside the lock we always
    // re-read the latest state from PocketBase, apply the mutation, and write
    // back — eliminating the lost-update window between independent requests.
    const outcome = await withLock<PatchOutcome>(
      `split-share:${shareCode}`,
      async () => {
        const split = await getActiveSplitByShareCode(shareCode);
        if (!split) {
          return { status: 404, body: { error: 'Not found' } };
        }

        if (!split.participants.includes(participantName)) {
          return { status: 400, body: { error: 'Invalid participant' } };
        }

        if (isSplitClosed(split)) {
          return {
            status: 403,
            body: { error: 'Divisão fechada — já não é possível alterar' },
          };
        }

        if (itemIndex >= split.items.length) {
          return { status: 400, body: { error: 'Invalid item' } };
        }

        const currentItem = split.items[itemIndex];
        let items: typeof split.items;

        if (hasMemberAllocation && memberAllocation) {
          const mode = memberAllocation.mode as SplitItemMode;
          const equalParticipating = memberAllocation.equalParticipating === true;
          const myValue =
            typeof memberAllocation.myValue === 'number'
              ? memberAllocation.myValue
              : Number(memberAllocation.myValue) || 0;
          const locked = isItemLocked(currentItem);
          const wasParticipating = currentItem.participants.includes(participantName);

          // Members can't switch an item into a mode the split owner has
          // disabled — but can keep editing one it's already using.
          const allowedModes = getAllowedMemberModes(split);
          if (mode !== getSplitItemMode(currentItem) && !allowedModes.includes(mode)) {
            return {
              status: 403,
              body: { error: 'Modo de divisão não permitido' },
            };
          }

          // Equal splits may carry the full desired participant list so any
          // member can toggle anyone's inclusion in one request.
          let equalParticipants: string[] | undefined;
          let equalParticipantsChanged: boolean | undefined;
          if (mode === 'equal' && Array.isArray(memberAllocation.participants)) {
            const known = new Set(split.participants);
            equalParticipants = memberAllocation.participants.filter(
              (name) => typeof name === 'string' && known.has(name)
            );
            const before = new Set(currentItem.participants);
            const after = new Set(equalParticipants);
            equalParticipantsChanged =
              before.size !== after.size ||
              [...before].some((name) => !after.has(name));
          }

          // Exact-amount and share-count splits may carry values for every
          // participant. Sanitize to known participants / numbers.
          let allocations: Record<string, number> | undefined;
          let totalIsValid: boolean | undefined;
          if (
            (mode === 'unequal' || mode === 'shares') &&
            memberAllocation.allocations &&
            typeof memberAllocation.allocations === 'object'
          ) {
            allocations = {};
            for (const name of split.participants) {
              const raw = memberAllocation.allocations[name];
              const value = typeof raw === 'number' ? raw : Number(raw);
              allocations[name] = Number.isFinite(value) && value > 0 ? value : 0;
            }
            if (mode === 'unequal') {
              const assigned = Object.values(allocations).reduce(
                (sum, value) => sum + value,
                0
              );
              totalIsValid = Math.abs(currentItem.price - assigned) < 0.01;
            }
          }

          const originalValue = currentItem.allocations?.[participantName] ?? 0;

          if (
            !canMemberSaveAllocation(mode, {
              equalParticipating,
              myValue,
              locked,
              wasParticipating,
              originalValue,
              totalIsValid,
              participantsChanged: equalParticipantsChanged,
            })
          ) {
            return {
              status: 403,
              body: {
                error:
                  mode === 'unequal' && totalIsValid === false
                    ? 'O total dividido tem de corresponder ao preço do item'
                    : 'Item bloqueado — não podes alterar esta divisão',
              },
            };
          }

          // Locked items are frozen for everyone, not just the caller — a
          // single "unequal"/"shares" request can carry values for every participant.
          if (locked && (mode === 'unequal' || mode === 'shares') && allocations) {
            for (const name of split.participants) {
              const before = currentItem.allocations?.[name] ?? 0;
              const after = allocations[name] ?? 0;
              if (Math.abs(before - after) >= 0.01) {
                return {
                  status: 403,
                  body: { error: 'Item bloqueado — não podes alterar esta divisão' },
                };
              }
            }
          }

          const updatedItem = mergeMemberItemAllocation(
            currentItem,
            split.participants,
            participantName,
            mode,
            { equalParticipating, myValue, allocations, participants: equalParticipants }
          );

          items = split.items.map((item, index) =>
            index === itemIndex
              ? reconcileItemLock(updatedItem, split.participants)
              : item
          );
        } else {
          const toggleResult = toggleItemParticipant(
            split.items,
            itemIndex,
            participantName,
            include
          );
          if (!toggleResult.ok) {
            if (toggleResult.reason === 'locked') {
              return {
                status: 403,
                body: { error: 'Item bloqueado — não podes remover-te desta divisão' },
              };
            }
            return { status: 400, body: { error: 'Invalid item' } };
          }

          items = toggleResult.items;
        }

        items = reconcileSplitItems(items, split.participants);
        const updated = await updateSplitItems(split.id, items);
        return { status: 200, body: toPublicSplitPayload(updated) };
      }
    );

    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('Split share PATCH error:', error);
    if ((error as Error).message === 'Server misconfiguration') {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
