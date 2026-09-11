import { NextResponse } from 'next/server';
import {
  getActiveSplitByShareCode,
  withSplitItemsOCC,
  SplitVersionConflictError,
} from '@/lib/splitShareAdmin';
import { toPublicSplitPayload, toggleItemParticipant } from '@/lib/splitShare';
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
import type { Split, SplitItem, SplitItemMode } from '@/lib/types';
import { withLock } from '@/lib/serverMutex';

const SHARE_CODE_RE = /^[A-Za-z0-9]{6,12}$/;

/** Rejeição de negócio — não é conflito de versão, não se repete. */
class PatchReject extends Error {
  constructor(
    public readonly httpStatus: 400 | 403 | 404,
    public readonly reason: string
  ) {
    super(reason);
  }
}

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

    /**
     * Aplica a intenção do participante ao split fresco e devolve os `items` a
     * gravar. Chamado dentro de `withSplitItemsOCC` — em cada tentativa recebe o
     * split re-lido, por isso as alterações de outra pessoa entretanto já lá
     * estão. As rejeições de negócio lançam `PatchReject` (não se repetem).
     */
    const applyIntent = (split: Split): SplitItem[] => {
      if (!split.participants.includes(participantName)) {
        throw new PatchReject(400, 'Invalid participant');
      }
      if (isSplitClosed(split)) {
        throw new PatchReject(403, 'Divisão fechada — já não é possível alterar');
      }
      if (itemIndex >= split.items.length) {
        throw new PatchReject(400, 'Invalid item');
      }

      const currentItem = split.items[itemIndex];
      let items: SplitItem[];

      if (hasMemberAllocation && memberAllocation) {
        const mode = memberAllocation.mode as SplitItemMode;
        const equalParticipating = memberAllocation.equalParticipating === true;
        const myValue =
          typeof memberAllocation.myValue === 'number'
            ? memberAllocation.myValue
            : Number(memberAllocation.myValue) || 0;
        const locked = isItemLocked(currentItem);
        const wasParticipating = currentItem.participants.includes(participantName);

        const allowedModes = getAllowedMemberModes(split);
        if (mode !== getSplitItemMode(currentItem) && !allowedModes.includes(mode)) {
          throw new PatchReject(403, 'Modo de divisão não permitido');
        }

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
          throw new PatchReject(
            403,
            mode === 'unequal' && totalIsValid === false
              ? 'O total dividido tem de corresponder ao preço do item'
              : 'Item bloqueado — não podes alterar esta divisão'
          );
        }

        if (locked && (mode === 'unequal' || mode === 'shares') && allocations) {
          for (const name of split.participants) {
            const before = currentItem.allocations?.[name] ?? 0;
            const after = allocations[name] ?? 0;
            if (Math.abs(before - after) >= 0.01) {
              throw new PatchReject(
                403,
                'Item bloqueado — não podes alterar esta divisão'
              );
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
          throw new PatchReject(
            toggleResult.reason === 'locked' ? 403 : 400,
            toggleResult.reason === 'locked'
              ? 'Item bloqueado — quem participa está fixo'
              : 'Invalid item'
          );
        }
        items = toggleResult.items;
      }

      return reconcileSplitItems(items, split.participants);
    };

    // `withLock` serializa dentro do mesmo processo (fast-path, ~0 retries);
    // `withSplitItemsOCC` cobre o multi-instância via `items_version`.
    const updated = await withLock(`split-share:${shareCode}`, () =>
      withSplitItemsOCC(shareCode, applyIntent)
    );

    return NextResponse.json(toPublicSplitPayload(updated), { status: 200 });
  } catch (error) {
    if (error instanceof PatchReject) {
      return NextResponse.json({ error: error.reason }, { status: error.httpStatus });
    }
    if ((error as Error).message === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error instanceof SplitVersionConflictError) {
      return NextResponse.json(
        { error: 'Muita gente a mexer ao mesmo tempo — tenta outra vez.' },
        { status: 409 }
      );
    }
    console.error('Split share PATCH error:', error);
    if ((error as Error).message === 'Server misconfiguration') {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
