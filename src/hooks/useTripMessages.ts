import { useState, useEffect, useCallback, useRef } from 'react';
import { messagesApi, subscriptions } from '@/lib/pocketbase';
import type { Message } from '@/lib/types';

export function useTripMessages(tripId: string, currentUserId?: string) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    
    // Store last read timestamp/id in simple way
    const lastReadRef = useRef<number>(Date.now());

    // Load messages
    const loadMessages = useCallback(async () => {
        try {
            const data = await messagesApi.getByTrip(tripId);
            setMessages(data);
            
            // Calculate unread
            // If chat is open, we mark all as read (virtually) by updating the timestamp
            // If chat is closed, count messages newer than last "session"
            if (!isOpen) { 
               // Simple count: assume we tracked "read until" somewhere persistent?
               // For MVP: We just count *new incoming* messages as unread while page is active?
               // Or we use localStorage to persist "last read time" for this trip.
               const lastRead = parseInt(localStorage.getItem(`trip_read_${tripId}`) || '0');
               const unread = data.filter(m => new Date(m.created).getTime() > lastRead && m.user_id !== currentUserId).length;
               setUnreadCount(unread);
            }
        } catch (error) {
            console.error(error);
        }
    }, [tripId, isOpen, currentUserId]);

    // Live updates
    useEffect(() => {
        loadMessages();

        subscriptions.subscribeToMessages(tripId, (e: any) => {
            if (e.action === 'create' || e.action === 'update') {
               // Reload to get expansion and sort
               loadMessages();
               
               // If closed, increment unread? No, loadMessages recalculates based on time.
            }
        });

        return () => {
             // We rely on Page to unsubscribeAll or careful management.
             // Here we use single subscription. 
             // Note: pocketbase.ts unsubscribeAll wipes everything. Ideally we need granular.
             // We will assume Page handles it.
        };
    }, [tripId, loadMessages]);

    // Mark as read when opened
    useEffect(() => {
        if (isOpen && messages.length > 0) {
            const latest = messages[messages.length - 1]; // sorted by created asc?
            const latestTime = new Date(latest.created).getTime();
            localStorage.setItem(`trip_read_${tripId}`, latestTime.toString());
            setUnreadCount(0);
        }
    }, [isOpen, messages, tripId]);
    
    // Actions
    const sendMessage = async (text: string, replyTo?: string) => {
        await messagesApi.create(tripId, text, replyTo);
    };

    const reactToMessage = async (msgId: string, emoji: string) => {
        await messagesApi.react(msgId, emoji);
    };

    return {
        messages,
        unreadCount,
        isOpen,
        setIsOpen,
        sendMessage,
        reactToMessage
    };
}
