import React from 'react';
import { ClipboardItem } from '../types';
import { ClipboardItemCard } from './ClipboardItem';

interface ClipboardFeedProps {
  items: ClipboardItem[];
  loading?: boolean;
}

export function ClipboardFeed({ items, loading }: ClipboardFeedProps) {
  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <p style={styles.hint}>Loading clipboard history…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={styles.centered}>
        <div style={styles.emptyIcon}>&#128203;</div>
        <p style={styles.emptyTitle}>No clipboard items yet</p>
        <p style={styles.hint}>
          Copy something on a connected device and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.feed}>
      {items.map((item) => (
        <ClipboardItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  feed: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 1rem',
    color: '#888',
    gap: '0.5rem',
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '0.5rem',
  },
  emptyTitle: {
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#444',
  },
  hint: {
    fontSize: '0.875rem',
    textAlign: 'center',
    maxWidth: 340,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #e0e0e0',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    marginBottom: '0.75rem',
  },
};
