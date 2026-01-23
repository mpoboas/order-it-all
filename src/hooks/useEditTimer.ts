'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRemainingEditTime, isOrderEditable } from '@/lib/utils';

const STORAGE_KEY = 'orderItAll_editTimers';

interface EditTimer {
  orderId: string;
  canEditUntil: string;
}

export function useEditTimer() {
  const [editTimers, setEditTimers] = useState<Record<string, EditTimer>>({});

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setEditTimers(JSON.parse(stored));
      } catch {
        // Ignore invalid JSON
      }
    }
  }, []);

  // Save to localStorage when timers change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(editTimers));
  }, [editTimers]);

  const startTimer = useCallback((orderId: string, canEditUntil: string) => {
    setEditTimers((prev) => ({
      ...prev,
      [orderId]: { orderId, canEditUntil },
    }));
  }, []);

  const removeTimer = useCallback((orderId: string) => {
    setEditTimers((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  const isEditable = useCallback(
    (orderId: string, canEditUntil?: string): boolean => {
      // If we have the edit deadline directly, use it
      if (canEditUntil) {
        return isOrderEditable(canEditUntil);
      }
      // Otherwise check our stored timers
      const timer = editTimers[orderId];
      if (!timer) return false;
      return isOrderEditable(timer.canEditUntil);
    },
    [editTimers]
  );

  const getRemainingTime = useCallback(
    (orderId: string, canEditUntil?: string): number => {
      // If we have the edit deadline directly, use it
      if (canEditUntil) {
        return getRemainingEditTime(canEditUntil);
      }
      // Otherwise check our stored timers
      const timer = editTimers[orderId];
      if (!timer) return 0;
      return getRemainingEditTime(timer.canEditUntil);
    },
    [editTimers]
  );

  return {
    editTimers,
    startTimer,
    removeTimer,
    isEditable,
    getRemainingTime,
  };
}
