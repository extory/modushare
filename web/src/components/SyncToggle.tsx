import React from 'react';
import { WSMessage } from '@modushare/shared';

interface SyncToggleProps {
  enabled: boolean;
  onToggle: (msg: Omit<WSMessage, 'deviceId'> & { deviceId?: string }) => void;
  isMobile?: boolean;
}

export function SyncToggle({ enabled, onToggle, isMobile }: SyncToggleProps) {
  const handleChange = () => {
    onToggle({
      type: enabled ? 'SYNC_DISABLE' : 'SYNC_ENABLE',
      timestamp: Date.now(),
    });
  };

  return (
    <div style={styles.container} title={enabled ? 'Sync On' : 'Sync Off'}>
      {!isMobile && <span style={styles.label}>{enabled ? 'Sync On' : 'Sync Off'}</span>}
      <button
        role="switch"
        aria-checked={enabled}
        onClick={handleChange}
        style={{
          ...styles.track,
          background: enabled ? '#6366f1' : '#d1d1d6',
        }}
      >
        <span
          style={{
            ...styles.thumb,
            transform: enabled ? 'translateX(20px)' : 'translateX(2px)',
          }}
        />
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#444',
    minWidth: 56,
    textAlign: 'right',
  },
  track: {
    position: 'relative',
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.25s',
    padding: 0,
  },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 0,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
    transition: 'transform 0.25s',
    display: 'block',
  },
};
