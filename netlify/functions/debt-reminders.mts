/**
 * Scheduled Function do Netlify: no dia 1 de cada mês às 9:00 UTC, pede à app
 * o lembrete mensal de dívidas (`/api/notifications/debt-reminders`).
 *
 * `URL` é dado pelo Netlify (endereço principal do site);
 * `NOTIFICATIONS_CRON_SECRET` é uma variável de ambiente da app, com o âmbito
 * "Functions". Só corre em deploys de produção publicados; para testar, o
 * botão "Run now" na página Functions do Netlify.
 */
export default async () => {
  const base = (process.env.URL ?? '').replace(/\/$/, '');
  const secret = process.env.NOTIFICATIONS_CRON_SECRET;
  if (!base || !secret) {
    console.log('[debt-reminders] falta URL ou NOTIFICATIONS_CRON_SECRET');
    return;
  }
  const res = await fetch(`${base}/api/notifications/debt-reminders`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
  console.log('[debt-reminders]', res.status, await res.text());
};

export const config = {
  schedule: '0 9 1 * *',
};
