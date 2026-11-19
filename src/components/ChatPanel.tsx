'use client';

// Realtime chat between a tracker's owner and the tracked device, stored in
// trackers/{id}/messages. Messages render as text (React escapes them).

import { useEffect, useRef, useState } from 'react';
import { sendMessage, subscribeToMessages } from '@/lib/firebase-services';
import { beep } from '@/lib/alerts';
import type { ChatMessage } from '@/lib/types';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  trackingId: string;
  role: 'owner' | 'device';
  senderName: string;
  /** Called when a message from the other side arrives (for badges/alerts). */
  onIncoming?: (message: ChatMessage) => void;
  compact?: boolean;
}

const MAX_LENGTH = 500;

export default function ChatPanel({ trackingId, role, senderName, onIncoming, compact }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  useEffect(() => {
    seenRef.current = null;
    setMessages([]);
    const unsub = subscribeToMessages(
      trackingId,
      (list) => {
        // First snapshot just seeds the "seen" set; later ones may alert.
        if (seenRef.current === null) {
          seenRef.current = new Set(list.map((m) => m.id));
        } else {
          for (const m of list) {
            if (!seenRef.current.has(m.id)) {
              seenRef.current.add(m.id);
              if (m.sender !== role) {
                beep(660, 120, 0.15);
                onIncomingRef.current?.(m);
              }
            }
          }
        }
        setMessages(list);
        setError(null);
      },
      () => setError('Chat is unavailable. Deploy the latest firestore.rules to enable it.'),
    );
    return unsub;
  }, [trackingId, role]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(trackingId, { text: value, sender: role, senderName });
    } catch {
      setError('Message failed to send.');
      setText(value);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`${styles.chat} ${compact ? styles.compact : ''}`}>
      <div ref={listRef} className={styles.list} aria-live="polite">
        {messages.length === 0 ? (
          <p className={styles.empty}>No messages yet. Say hello 👋</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`${styles.msg} ${m.sender === role ? styles.mine : styles.theirs}`}>
              <div className={styles.meta}>
                {m.senderName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {m.pending && ' · sending…'}
              </div>
              <div className={styles.text}>{m.text}</div>
            </div>
          ))
        )}
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <form onSubmit={submit} className={styles.form}>
        <label htmlFor={`chat-${trackingId}`} className="sr-only">
          Message
        </label>
        <input
          id={`chat-${trackingId}`}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder={role === 'owner' ? 'Message the device…' : 'Message the tracker owner…'}
          maxLength={MAX_LENGTH}
          autoComplete="off"
        />
        <button type="submit" disabled={!text.trim() || sending}>
          Send
        </button>
      </form>
    </div>
  );
}
