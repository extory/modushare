import React, { useEffect, useState, useCallback } from 'react';
import { SharePartner, ShareInvitation } from '../types';
import { endpoints } from '../api/endpoints';

interface Props {
  pendingInvitations: ShareInvitation[];
  onInvitationHandled: (id: string) => void;
}

export function ShareManager({ pendingInvitations, onInvitationHandled }: Props) {
  const [partners, setPartners] = useState<SharePartner[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'partners' | 'invite' | 'incoming'>('partners');

  const loadPartners = useCallback(async () => {
    try {
      const { partners } = await endpoints.getSharePartners();
      setPartners(partners);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) loadPartners();
  }, [open, loadPartners]);

  const hasPending = pendingInvitations.length > 0;

  const handleInvite = async () => {
    if (!email.trim()) return;
    setError(null); setSuccess(null); setLoading(true);
    try {
      const res = await endpoints.sendShareInvitation(email.trim());
      setSuccess(`${res.toUsername}(${res.toEmail})님에게 초대를 보냈습니다`);
      setEmail('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '초대 실패';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (targetId: string) => {
    try {
      await endpoints.removeSharePartner(targetId);
      setPartners((prev) => prev.filter((p) => p.userId !== targetId));
    } catch { /* ignore */ }
  };

  const handleAccept = async (inv: ShareInvitation) => {
    try {
      await endpoints.acceptInvitation(inv.id);
      onInvitationHandled(inv.id);
      await loadPartners();
    } catch { /* ignore */ }
  };

  const handleReject = async (inv: ShareInvitation) => {
    try {
      await endpoints.rejectInvitation(inv.id);
      onInvitationHandled(inv.id);
    } catch { /* ignore */ }
  };

  return (
    <div style={styles.wrap}>
      <button style={styles.triggerBtn} onClick={() => setOpen((v) => !v)}>
        공유 관리
        {hasPending && <span style={styles.badge}>{pendingInvitations.length}</span>}
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>공유 관리</span>
            <button style={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
          </div>

          <div style={styles.tabs}>
            {(['partners', 'invite', 'incoming'] as const).map((t) => (
              <button
                key={t}
                style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
                onClick={() => setTab(t)}
              >
                {t === 'partners' ? '공유 중' : t === 'invite' ? '초대 보내기' : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    받은 초대
                    {hasPending && <span style={styles.tabBadge}>{pendingInvitations.length}</span>}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'partners' && (
            partners.length === 0 ? (
              <p style={styles.empty}>공유 중인 대상이 없습니다</p>
            ) : (
              <ul style={styles.list}>
                {partners.map((p) => (
                  <li key={p.userId} style={styles.listItem}>
                    <div style={styles.partnerInfo}>
                      <span style={styles.partnerName}>{p.username}</span>
                      <span style={styles.partnerEmail}>{p.email}</span>
                    </div>
                    <button style={styles.removeBtn} onClick={() => handleRemove(p.userId)}>제거</button>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'invite' && (
            <>
              <div style={styles.addRow}>
                <input
                  style={styles.input}
                  type="email"
                  placeholder="초대할 이메일 입력"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                />
                <button style={styles.addBtn} onClick={handleInvite} disabled={loading}>
                  {loading ? '…' : '초대'}
                </button>
              </div>
              {error && <p style={styles.error}>{error}</p>}
              {success && <p style={styles.successMsg}>{success}</p>}
              <p style={styles.hint}>상대방이 수락하면 클립보드가 공유됩니다</p>
            </>
          )}

          {tab === 'incoming' && (
            pendingInvitations.length === 0 ? (
              <p style={styles.empty}>받은 초대가 없습니다</p>
            ) : (
              <ul style={styles.list}>
                {pendingInvitations.map((inv) => (
                  <li key={inv.id} style={styles.invItem}>
                    <div style={styles.partnerInfo}>
                      <span style={styles.partnerName}>{inv.fromUsername}</span>
                      <span style={styles.partnerEmail}>{inv.fromEmail}</span>
                    </div>
                    <div style={styles.invActions}>
                      <button style={styles.acceptBtn} onClick={() => handleAccept(inv)}>수락</button>
                      <button style={styles.rejectBtn} onClick={() => handleReject(inv)}>거절</button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative' },
  triggerBtn: {
    padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d1d6',
    background: '#fff', cursor: 'pointer', fontSize: '0.8125rem',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  badge: {
    background: '#ef4444', color: '#fff', borderRadius: '50%',
    width: 16, height: 16, fontSize: '0.7rem', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 700,
  },
  panel: {
    position: 'absolute', right: 0, top: '2rem', width: 340,
    background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    padding: '1rem', zIndex: 100,
  },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem',
  },
  panelTitle: { fontSize: '0.9rem', fontWeight: 600 },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#888' },
  tabs: { display: 'flex', gap: 4, marginBottom: '0.75rem', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 },
  tab: {
    padding: '4px 10px', borderRadius: 6, border: 'none', background: 'none',
    cursor: 'pointer', fontSize: '0.8rem', color: '#888',
  },
  tabActive: { background: '#f0f0ff', color: '#6366f1', fontWeight: 600 },
  tabBadge: {
    background: '#ef4444', color: '#fff', borderRadius: '50%',
    width: 14, height: 14, fontSize: '0.65rem', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
  },
  addRow: { display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' },
  input: {
    flex: 1, padding: '0.4rem 0.625rem', borderRadius: 7,
    border: '1px solid #d1d1d6', fontSize: '0.85rem', outline: 'none',
  },
  addBtn: {
    padding: '0.4rem 0.75rem', borderRadius: 7, border: 'none',
    background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '0.85rem',
  },
  error: { color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.5rem' },
  successMsg: { color: '#22c55e', fontSize: '0.8rem', marginBottom: '0.5rem' },
  hint: { color: '#aaa', fontSize: '0.75rem', marginTop: 4 },
  empty: { color: '#aaa', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  listItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.5rem 0.625rem', borderRadius: 8, background: '#f5f5f7',
  },
  invItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.5rem 0.625rem', borderRadius: 8, background: '#faf5ff',
    border: '1px solid #e9d5ff',
  },
  partnerInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  partnerName: { fontSize: '0.875rem', fontWeight: 500 },
  partnerEmail: { fontSize: '0.75rem', color: '#888' },
  removeBtn: {
    padding: '3px 10px', borderRadius: 6, border: '1px solid #fca5a5',
    background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem',
  },
  invActions: { display: 'flex', gap: 6 },
  acceptBtn: {
    padding: '3px 10px', borderRadius: 6, border: 'none',
    background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '0.75rem',
  },
  rejectBtn: {
    padding: '3px 10px', borderRadius: 6, border: '1px solid #d1d1d6',
    background: '#fff', color: '#555', cursor: 'pointer', fontSize: '0.75rem',
  },
};
