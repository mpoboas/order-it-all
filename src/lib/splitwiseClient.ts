import { Splitwise } from 'splitwise';
import type { GroupSplitwise } from '@/lib/types';
import { isSplitwiseConnected } from '@/lib/splitwisePb';

export function getSplitwiseRedirectUri(): string {
  if (process.env.SPLITWISE_REDIRECT_URI) {
    return process.env.SPLITWISE_REDIRECT_URI;
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/splitwise/oauth/callback`;
}

export function getSplitwiseCredentials() {
  const consumerKey =
    process.env.SPLITWISE_CONSUMER_KEY || process.env.SPLITWISE_CLIENT_ID;
  const consumerSecret =
    process.env.SPLITWISE_CONSUMER_SECRET || process.env.SPLITWISE_CLIENT_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error('Splitwise credentials not configured');
  }
  return { consumerKey, consumerSecret };
}

export function createSplitwiseClient(accessToken: string): Splitwise {
  return new Splitwise({ accessToken });
}

export function createSplitwiseClientFromConfig(
  config: GroupSplitwise
): Splitwise {
  const token = config.access_token?.trim();
  if (!isSplitwiseConnected(config) || !token) {
    throw new Error('Splitwise not connected');
  }
  return createSplitwiseClient(token);
}
