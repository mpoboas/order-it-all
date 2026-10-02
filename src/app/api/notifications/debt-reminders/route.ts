import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { sendMonthlyDebtReminders } from '@/lib/notifications/debtReminders';

/**
 * Lembrete mensal de dívidas. Chamada pela Scheduled Function do Netlify
 * (`netlify/functions/debt-reminders.mts`) no dia 1 de cada mês, com
 * `Authorization: Bearer <NOTIFICATIONS_CRON_SECRET>` — a mesma variável de
 * ambiente da app no Netlify (com o âmbito "Functions"). Sem ela, fechada.
 */
function authorized(request: Request): boolean {
  const secret = process.env.NOTIFICATIONS_CRON_SECRET;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !got) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const result = await sendMonthlyDebtReminders(await getAdminPb());
    console.log('[debt-reminders]', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[debt-reminders] falhou:', error);
    return NextResponse.json({ error: 'Falhou' }, { status: 500 });
  }
}
