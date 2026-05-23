import { NextResponse } from 'next/server';
import {
  getActiveSplitByShareCode,
  updateSplitItems,
} from '@/lib/splitShareAdmin';
import {
  toPublicSplitPayload,
  toggleItemParticipant,
} from '@/lib/splitShare';
import { reconcileSplitItems } from '@/lib/splitItems';
import { isSplitClosed } from '@/lib/splitStatus';

const SHARE_CODE_RE = /^[A-Za-z0-9]{6,12}$/;

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

    const split = await getActiveSplitByShareCode(shareCode);
    if (!split) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!split.participants.includes(participantName)) {
      return NextResponse.json({ error: 'Invalid participant' }, { status: 400 });
    }

    if (isSplitClosed(split)) {
      return NextResponse.json(
        { error: 'Divisão fechada — já não é possível alterar' },
        { status: 403 }
      );
    }

    if (itemIndex >= split.items.length) {
      return NextResponse.json({ error: 'Invalid item' }, { status: 400 });
    }

    const toggleResult = toggleItemParticipant(
      split.items,
      itemIndex,
      participantName,
      include
    );
    if (!toggleResult.ok) {
      if (toggleResult.reason === 'locked') {
        return NextResponse.json(
          { error: 'Item bloqueado — não podes remover-te desta divisão' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Invalid item' }, { status: 400 });
    }

    const items = reconcileSplitItems(toggleResult.items, split.participants);

    const updated = await updateSplitItems(split.id, items);
    return NextResponse.json(toPublicSplitPayload(updated));
  } catch (error) {
    console.error('Split share PATCH error:', error);
    if ((error as Error).message === 'Server misconfiguration') {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
