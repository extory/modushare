import React, { useState } from 'react';
import { ClipboardItem as ClipboardItemType } from '../types';
import { ImagePreview } from './ImagePreview';
import { useClipboard } from '../hooks/useClipboard';
import { endpoints } from '../api/endpoints';
import { useClipboardStore } from '../store/clipboardStore';

interface ClipboardItemProps {
  item: ClipboardItemType;
}

const MAX_TEXT_PREVIEW = 300;

function formatTime(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ClipboardItemCard({ item }: ClipboardItemProps) {
  const { copyText, copyImageUrl } = useClipboard();
  const removeItem = useClipboardStore((s) => s.removeItem);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCopy = async () => {
    let success = false;
    if (item.contentType === 'text' && item.contentText) {
      success = await copyText(item.contentText);
    } else if (item.contentType === 'image' && item.imageUrl) {
      success = await copyImageUrl(item.imageUrl);
    }
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await endpoints.deleteItem(item.id);
      removeItem(item.id);
    } catch {
      setDeleting(false);
    }
  };

  const isTextLong =
    item.contentType === 'text' &&
    (item.contentText?.length ?? 0) > MAX_TEXT_PREVIEW;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.badge}>
          {item.contentType === 'text' ? '📄' : item.contentType === 'image' ? '🖼' : '📎'}
          {' '}
          {item.contentType === 'text' ? 'Text' : item.contentType === 'image' ? 'Image' : 'File'}
        </span>
        <span style={styles.device}>{item.deviceId.slice(0, 8)}</span>
        <span style={styles.time}>{formatTime(item.createdAt)}</span>
        <div style={styles.actions}>
          <button
            style={{ ...styles.btn, ...(copied ? styles.btnSuccess : {}) }}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? '&#10003; Copied' : '&#128203; Copy'}
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnDanger }}
            onClick={handleDelete}
            disabled={deleting}
            title="Delete item"
          >
            {deleting ? '…' : '&#128465;'}
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {item.contentType === 'text' && item.contentText && (
          <p style={styles.text}>
            {isTextLong
              ? item.contentText.slice(0, MAX_TEXT_PREVIEW) + '…'
              : item.contentText}
          </p>
        )}
        {item.contentType === 'image' && item.imageUrl && (
          <ImagePreview src={item.imageUrl} />
        )}
        {item.contentType === 'file' && item.fileUrl && (
          <div style={styles.fileCard}>
            <span style={styles.fileIcon}>📎</span>
            <div style={styles.fileMeta}>
              <a href={item.fileUrl} download={item.fileName} style={styles.fileLink}>
                {item.fileName ?? 'Download file'}
              </a>
              {item.fileSize != null && (
                <span style={styles.fileSize}>{formatBytes(item.fileSize)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '0.875rem 1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'box-shadow 0.2s',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.625rem',
    flexWrap: 'wrap',
  },
  badge: {
    fontSize: '0.75rem',
    fontWeight: 600,
    background: '#f0f0f5',
    padding: '2px 8px',
    borderRadius: 99,
    color: '#555',
  },
  device: {
    fontSize: '0.7rem',
    color: '#aaa',
    fontFamily: 'monospace',
  },
  time: {
    fontSize: '0.75rem',
    color: '#aaa',
    marginLeft: 'auto',
  },
  actions: { display: 'flex', gap: '0.375rem' },
  btn: {
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid #d1d1d6',
    background: '#f5f5f7',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 500,
    transition: 'background 0.15s',
  },
  btnSuccess: {
    background: '#d1fae5',
    borderColor: '#6ee7b7',
    color: '#065f46',
  },
  btnDanger: {
    background: '#fff',
    borderColor: '#fca5a5',
    color: '#ef4444',
  },
  content: { overflow: 'hidden' },
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    background: '#f5f5f7',
    borderRadius: 8,
  },
  fileIcon: { fontSize: '1.25rem' },
  fileMeta: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  fileLink: {
    fontSize: '0.875rem',
    color: '#6366f1',
    fontWeight: 500,
    textDecoration: 'none',
  },
  fileSize: { fontSize: '0.75rem', color: '#aaa' },
  text: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: '#333',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};
