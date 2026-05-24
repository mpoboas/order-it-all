'use client';

import dynamic from 'next/dynamic';

const PushNotificationManager = dynamic(
  () => import('@/components/features/PushNotificationManager'),
  { ssr: false }
);

export function LazyPushNotificationManager() {
  return <PushNotificationManager />;
}
