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
import { reconcileSplitItems } from '@/lib/splitItems';
import { isSplitClosed } from '@/lib/splitStatus';
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

    if (!participantName || !Number.isInteger(itemIndex) || itemIndex < 0) {
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

        const items = reconcileSplitItems(toggleResult.items, split.participants);
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
