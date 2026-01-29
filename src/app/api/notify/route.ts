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
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, title, message, url, targetUserIds } = body;

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
    await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);

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

    const subscriptions = await pb.collection('push_subscriptions').getFullList({
      filter: filter,
    });

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
        icon: '/icon-192x192.png'
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
