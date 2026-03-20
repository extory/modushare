import React, { useEffect, useState, useCallback } from 'react';
import { SharePartner } from '../types';
import { endpoints } from '../api/endpoints';

export function ShareManager() {
  const [partners, setPartners] = useState<SharePartner[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadPartners = useCallback(async () => {
    try {
      const { partners } = await endpoints.getSharePartners();
      setPartners(partners);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) loadPartners();
  }, [open, loadPartners]);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const partner = await endpoints.addSharePartner(email.trim());
      setPartners((prev) => [partner, ...prev]);
      setEmail('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '추가 실패';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (targetId: string) => {
    try {
      await endpoints.removeSharePartner(targetId);
      setPartners((prev) => prev.filter((p) => p.userId !== targetId));
    } catch {
      // ignore
    }
  };

  return (
    <div style={styles.wrap}>
      <button style={styles.triggerBtn} onClick={() => setOpen((v) => !v)}>
        공유 관리
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>공유 대상</span>
            <button style={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
          </div>

          <div style={styles.addRow}>
            <input
              style={styles.input}
              type="email"
              placeholder="이메일 입력"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button style={styles.addBtn} onClick={handleAdd} disabled={loading}>
              {loading ? '…' : '추가'}
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          {partners.length === 0 ? (
            <p style={styles.empty}>공유 중인 대상이 없습니다</p>
          ) : (
            <ul style={styles.list}>
              {partners.map((p) => (
                <li key={p.userId} style={styles.listItem}>
                  <div style={styles.partnerInfo}>
                    <span style={styles.partnerName}>{p.username}</span>
                    <span style={styles.partnerEmail}>{p.email}</span>
                  </div>
                  <button style={styles.removeBtn} onClick={() => handleRemove(p.userId)}>
                    제거
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative' },
  triggerBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #d1d1d6',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '0.8125rem',
  },
  panel: {
    position: 'absolute',
    right: 0,
    top: '2rem',
    width: 320,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    padding: '1rem',
    zIndex: 100,
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  panelTitle: { fontSize: '0.9rem', fontWeight: 600 },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    color: '#888',
  },
  addRow: { display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' },
  input: {
    flex: 1,
    padding: '0.4rem 0.625rem',
    borderRadius: 7,
    border: '1px solid #d1d1d6',
    fontSize: '0.85rem',
    outline: 'none',
  },
  addBtn: {
    padding: '0.4rem 0.75rem',
    borderRadius: 7,
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  error: { color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.5rem' },
  empty: { color: '#aaa', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0.625rem',
    borderRadius: 8,
    background: '#f5f5f7',
  },
  partnerInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  partnerName: { fontSize: '0.875rem', fontWeight: 500 },
  partnerEmail: { fontSize: '0.75rem', color: '#888' },
  removeBtn: {
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid #fca5a5',
    background: '#fff',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
};
