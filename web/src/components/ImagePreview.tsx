import React, { useState } from 'react';

interface ImagePreviewProps {
  src: string; // Either a URL or a base64 data: URI
  alt?: string;
  maxHeight?: number;
}

export function ImagePreview({
  src,
  alt = 'Clipboard image',
  maxHeight = 200,
}: ImagePreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div style={styles.errorBox}>
        <span style={styles.errorIcon}>&#128247;</span>
        <span style={styles.errorText}>Image unavailable</span>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <img
        src={src}
        alt={alt}
        style={{
          ...styles.image,
          maxHeight: expanded ? '80vh' : maxHeight,
          cursor: expanded ? 'zoom-out' : 'zoom-in',
        }}
        onClick={() => setExpanded((e) => !e)}
        onError={() => setError(true)}
      />
      {!expanded && (
        <span style={styles.hint}>Click to expand</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  image: {
    maxWidth: '100%',
    objectFit: 'contain',
    borderRadius: 6,
    transition: 'max-height 0.3s ease',
    display: 'block',
  },
  hint: {
    fontSize: '0.7rem',
    color: '#aaa',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0.5rem 0.75rem',
    background: '#f5f5f7',
    borderRadius: 6,
    color: '#888',
  },
  errorIcon: { fontSize: '1.25rem' },
  errorText: { fontSize: '0.8rem' },
};
