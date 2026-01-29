'use client';

import { useEffect, useState, useRef } from 'react';
import { messagesApi, subscriptions, pb } from '@/lib/pocketbase';
import { useUser } from '@/context/UserContext';
import type { Message } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { cn, getRelativeTime } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

interface TripChatProps {
    tripId: string;
    messages: Message[];
    onSendMessage: (text: string, replyTo?: string) => Promise<void>;
    onReact: (msgId: string, emoji: string) => void;
    currentUserId?: string;
}

export function TripChat({ tripId, messages, onSendMessage, onReact, currentUserId }: TripChatProps) {
    const [newMessage, setNewMessage] = useState('');
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    // Auto-scroll on new messages
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = newMessage.trim();

        if (!text || sending) return;

        setNewMessage('');
        setReplyingTo(null);
        setSending(true);

        try {
            await onSendMessage(text, replyingTo?.id);
        } catch (error) {
            console.error('Error sending message:', error);
            setNewMessage(text); // Restore
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden relative">
            {/* Header (optional if needed context, but Sheet usually has header) */}

            {/* Messages List */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
                {messages.length === 0 ? (
                    <div className="text-center py-20 text-[var(--text-muted)] animate-fade-in-up">
                        <div className="text-4xl mb-2">💬</div>
                        <p className="font-medium">Começa a conversa!</p>
                        <p className="text-xs">Combina detalhes com o grupo</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isMe = msg.user_id === currentUserId;
                        const showAvatar = !isMe && (idx === 0 || messages[idx - 1].user_id !== msg.user_id);

                        return (
                            <div
                                key={msg.id}
                                className={cn(
                                    "flex w-full items-end gap-2 group",
                                    isMe ? "justify-end" : "justify-start"
                                )}
                            >
                                {!isMe && (
                                    <div className="w-8 flex-shrink-0 mb-1">
                                        {showAvatar ? (
                                            <Avatar name={msg.expand?.user_id?.name || '?'} size="sm" />
                                        ) : <div className="w-8" />}
                                    </div>
                                )}

                                <div className={cn(
                                    "max-w-[85%] relative rounded-2xl px-3 py-2 text-sm shadow-sm transition-all",
                                    isMe
                                        ? "bg-violet-600 text-white rounded-br-none"
                                        : "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-bl-none"
                                )}>
                                    {/* Sender Name */}
                                    {!isMe && showAvatar && (
                                        <div className="text-[11px] font-bold text-violet-500 mb-1">
                                            {msg.expand?.user_id?.name || 'Alguém'}
                                        </div>
                                    )}

                                    {/* Reply Block */}
                                    {msg.expand?.reply_to && (
                                        <div className="mb-2 rounded bg-black/5 dark:bg-white/10 border-l-2 border-white/50 p-1.5 flex flex-col text-xs bg-opacity-50">
                                            <span className="font-bold opacity-80 truncate">
                                                {msg.expand.reply_to.expand?.user_id?.name || '...'}
                                            </span>
                                            <span className="truncate opacity-70">
                                                {msg.expand.reply_to.text}
                                            </span>
                                        </div>
                                    )}

                                    {/* Message Text */}
                                    <div className="whitespace-pre-wrap leading-relaxed">
                                        {msg.text}
                                    </div>

                                    {/* Metadata */}
                                    <div className={cn(
                                        "text-[10px] mt-1 text-right opacity-60 font-medium",
                                        isMe ? "text-violet-200" : "text-gray-400"
                                    )}>
                                        {new Date(msg.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>

                                    {/* Reactions Bubble */}
                                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                        <div className="absolute -bottom-2 right-0 bg-white dark:bg-slate-700 shadow-sm border border-gray-100 dark:border-slate-600 rounded-full px-1.5 py-0.5 text-[10px] flex items-center gap-0.5 scale-90 z-20">
                                            {Object.values(msg.reactions).slice(0, 3).map((r, i) => <span key={i}>{r}</span>)}
                                            {Object.keys(msg.reactions).length > 1 && <span className="font-bold text-gray-500">{Object.keys(msg.reactions).length}</span>}
                                        </div>
                                    )}

                                    {/* Interaction Menu (Hidden by default, reveal on hover/tap) */}
                                    <div className={cn(
                                        "absolute top-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 rounded-lg backdrop-blur-sm",
                                        isMe ? "-left-14" : "-right-14"
                                    )}>
                                        <button
                                            onClick={() => setReplyingTo(msg)}
                                            className="p-1.5 bg-gray-200 dark:bg-slate-700 rounded-full hover:scale-110 transition-transform"
                                            title="Responder"
                                        >
                                            <span className="material-icons text-[14px] text-gray-600 dark:text-gray-300">reply</span>
                                        </button>
                                        <button
                                            onClick={() => onReact(msg.id, '❤️')}
                                            className="p-1.5 bg-gray-200 dark:bg-slate-700 rounded-full hover:scale-110 transition-transform hover:bg-red-100"
                                            title="Gosto"
                                        >
                                            <span className="text-[12px]">❤️</span>
                                        </button>
                                        <button
                                            onClick={() => onReact(msg.id, '👍')}
                                            className="p-1.5 bg-gray-200 dark:bg-slate-700 rounded-full hover:scale-110 transition-transform hover:bg-blue-100"
                                            title="Fixe"
                                        >
                                            <span className="text-[12px]">👍</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-[var(--border)] flex flex-col gap-2 relative z-20">
                {/* Reply Context */}
                {replyingTo && (
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 p-2 rounded-lg border-l-4 border-violet-500 mb-1 animate-in slide-in-from-bottom-2">
                        <div className="flex flex-col text-sm overflow-hidden">
                            <span className="font-bold text-violet-600 dark:text-violet-400 text-xs">A responder a {replyingTo.expand?.user_id?.name || '...'}</span>
                            <span className="truncate text-gray-600 dark:text-gray-400">{replyingTo.text}</span>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded-full">
                            <span className="material-icons text-sm">close</span>
                        </button>
                    </div>
                )}

                <form onSubmit={handleSend} className="flex gap-2 items-end">
                    <div className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center px-4 py-2 border border-transparent focus-within:border-violet-500 transition-colors">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Escreve uma mensagem..."
                            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm dark:text-white max-h-24"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                        className={cn(
                            "p-3 rounded-full shadow-lg transition-all active:scale-95 flex items-center justify-center",
                            newMessage.trim()
                                ? "bg-violet-600 text-white hover:bg-violet-700"
                                : "bg-gray-200 dark:bg-slate-800 text-gray-400 cursor-not-allowed"
                        )}
                    >
                        {sending ? <LoadingSpinner size="sm" /> : <span className="material-icons text-xl translate-x-0.5">send</span>}
                    </button>
                </form>
            </div>
        </div>
    );
}
