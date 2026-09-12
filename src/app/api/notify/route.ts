import { NextResponse } from 'next/server';
import webPush from 'web-push';
import PocketBase from 'pocketbase';

// Init Backend PB Client
// Note: In production you MUST set POCKETBASE_ADMIN_EMAIL/PASSWORD env vars
const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top');

// Configure Web Push
const vapidKeys = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  privateKey: process.env.VAPID_PRIVATE_KEY!,
};

if (vapidKeys.publicKey && vapidKeys.privateKey) {
  webPush.setVapidDetails(
    'mailto:admin@orderitall.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} else {
  console.warn('VAPID keys missing at module load — pushes vão falhar em silêncio (webPush.sendNotification rejeita, o .catch() por-subscrição só regista no log).');
}

// Diagnóstico: erros do SDK do PocketBase trazem `response`/`status` úteis que
// `String(error)`/`error.message` não mostram. Devolvido no JSON de resposta
// (visível no separador Network) para não depender de veres o terminal do
// `next dev`.
function errorDetail(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; response?: unknown; message?: string };
    if (anyErr.status || anyErr.response) {
      return `status=${anyErr.status ?? '?'} response=${JSON.stringify(anyErr.response)}`;
    }
    if (anyErr.message) return anyErr.message;
  }
  return String(err);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, title, message, url, targetUserIds, excludeUserId } = body;

    if (!title || !message) {
      return NextResponse.json({ error: 'Missing title or message' }, { status: 400 });
    }

    // Authenticate as Admin to fetch all tokens (Required)
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPass = process.env.POCKETBASE_ADMIN_PASSWORD;

    if (!adminEmail || !adminPass) {
      console.warn('Admin credentials missing. Cannot fetch subscriptions.');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Login as admin (Superuser)
    try {
      await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
    } catch (authErr) {
      console.error('PocketBase admin auth failed:', authErr);
      return NextResponse.json(
        { error: 'PocketBase admin auth failed', detail: errorDetail(authErr) },
        { status: 500 },
      );
    }

    // Determine recipients
    let recipients: string[] = [];

    if (targetUserIds && Array.isArray(targetUserIds)) {
      recipients = targetUserIds;
    } else if (groupId) {
      // Fetch group members
      try {
        const group = await pb.collection('groups').getOne(groupId);
        // Assuming 'members' field exists or we have to query. 
        // Based on typical schema, group might have 'members' array relation.
        recipients = group.members || [];
      } catch (e) {
        console.error('Group fetch error', e);
      }
    }

    // Quem disparou a ação já vê o resultado no ecrã — não se auto-notifica
    // (mesma política dos toasts: otimista = silêncio no sucesso).
    if (excludeUserId) {
      recipients = recipients.filter((id) => id !== excludeUserId);
    }

    if (recipients.length === 0) {
      return NextResponse.json({ message: 'No recipients found' });
    }

    // Fetch subscriptions for these users
    // Since PB filter uses individual requests or we need a complex OR query
    // Optimisation: Fetch all subs where user is in the list
    // Unfortunately "user IN [...]" isn't direct in PB filters easily for large lists, 
    // but for small groups typical of this app, we can iterate or use a filter string.
    
    // Construct filter: user="id1" || user="id2" ...
    const filter = recipients.map(id => `user="${id}"`).join(' || ');
    
    if (!filter) return NextResponse.json({ message: 'No valid user filters' });

    let subscriptions;
    try {
      subscriptions = await pb.collection('push_subscriptions').getFullList({
        filter: filter,
      });
    } catch (subErr) {
      console.error('Fetching push_subscriptions failed:', subErr);
      return NextResponse.json(
        { error: 'Fetching push_subscriptions failed', detail: errorDetail(subErr) },
        { status: 500 },
      );
    }

    console.log(`Sending specific notifications to ${subscriptions.length} devices...`);

    // Send notifications
    const notifications = subscriptions.map(sub => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: sub.keys,
      };
      
      const payload = JSON.stringify({
        title,
        body: message,
        url: url || '/groups',
        icon: '/android-chrome-192x192.png',
        // Agrupa no telemóvel avisos sucessivos sobre o mesmo destino (ex.: a
        // mesma viagem) em vez de os empilhar — ver `tag`/`renotify` no sw.js.
        tag: url || undefined,
      });

      return webPush.sendNotification(pushConfig, payload).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription/Endpoint is gone, delete from DB
          pb.collection('push_subscriptions').delete(sub.id);
        }
        console.error('Push send error:', err);
      });
    });

    await Promise.all(notifications);

    return NextResponse.json({ success: true, count: notifications.length });

  } catch (error) {
    console.error('Notification API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', detail: errorDetail(error) },
      { status: 500 },
    );
  }
}
