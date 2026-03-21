import React, { useEffect, useState, useCallback } from 'react';
import { endpoints } from '../api/endpoints';
import { AdminUser, AdminStats, AdminStorageUser } from '../types';

type Tab = 'overview' | 'users' | 'storage';

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [storage, setStorage] = useState<AdminStorageUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u, st] = await Promise.all([
        endpoints.adminGetStats(),
        endpoints.adminGetUsers(),
        endpoints.adminGetStorage(),
      ]);
      setStats(s);
      setUsers(u.users);
      setStorage(st.users);
    } catch {
      setError('데이터를 불러올 수 없습니다. 관리자 권한이 필요합니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.header}>
          <h2 style={s.title}>백오피스 관리자</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.tabs}>
          {(['overview', 'users', 'storage'] as Tab[]).map((t) => (
            <button
              key={t}
              style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t === 'overview' ? '개요' : t === 'users' ? '가입자' : '스토리지'}
            </button>
          ))}
        </div>

        <div style={s.body}>
          {loading && <p style={s.empty}>로딩 중…</p>}
          {error && <p style={s.errMsg}>{error}</p>}

          {!loading && !error && tab === 'overview' && stats && (
            <div>
              <div style={s.grid}>
                <StatCard title="전체 가입자" value={String(stats.users.total)} sub={`Google ${stats.users.google} / Email ${stats.users.email}`} />
                <StatCard title="전체 공유 연결" value={String(stats.shares.total)} sub={`일 ${stats.shares.daily} / 주 ${stats.shares.weekly} / 월 ${stats.shares.monthly}`} />
                <StatCard title="클립보드 항목" value={String(stats.clipboard.total)} sub={`일 ${stats.clipboard.daily} / 주 ${stats.clipboard.weekly} / 월 ${stats.clipboard.monthly}`} />
                <StatCard title="총 스토리지 사용량" value={fmt(stats.storage.total_bytes)} sub="텍스트 기준" />
              </div>
            </div>
          )}

          {!loading && !error && tab === 'users' && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>이메일</th>
                    <th style={s.th}>가입일</th>
                    <th style={s.th}>방법</th>
                    <th style={s.th}>항목수</th>
                    <th style={s.th}>용량</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={s.tr}>
                      <td style={s.td}>{u.email}</td>
                      <td style={s.td}>{fmtDate(u.created_at)}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: u.login_method === 'google' ? '#4285f4' : '#6366f1' }}>
                          {u.login_method}
                        </span>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{u.item_count}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{fmt(u.text_bytes)}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>가입자 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && tab === 'storage' && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>이메일</th>
                    <th style={s.th}>항목수</th>
                    <th style={s.th}>사용 용량</th>
                  </tr>
                </thead>
                <tbody>
                  {storage.map((u) => (
                    <tr key={u.id} style={s.tr}>
                      <td style={s.td}>{u.email}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{u.item_count}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{fmt(u.text_bytes)}</td>
                    </tr>
                  ))}
                  {storage.length === 0 && (
                    <tr><td colSpan={3} style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>데이터 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>{title}</div>
      <div style={s.cardValue}>{value}</div>
      <div style={s.cardSub}>{sub}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  panel: {
    background: '#fff', borderRadius: 14, width: 720, maxWidth: '95vw',
    maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
  },
  title: { fontSize: '1.1rem', fontWeight: 700, color: '#111' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '1.1rem',
    cursor: 'pointer', color: '#666', padding: '4px 8px',
  },
  tabs: {
    display: 'flex', gap: 4, padding: '0.75rem 1.5rem 0',
    borderBottom: '1px solid #e5e7eb',
  },
  tab: {
    padding: '6px 16px', border: 'none', background: 'none',
    cursor: 'pointer', fontSize: '0.875rem', color: '#888',
    borderRadius: '6px 6px 0 0', fontWeight: 500,
  },
  tabActive: { background: '#f0f0ff', color: '#6366f1', fontWeight: 700 },
  body: { flex: 1, overflow: 'auto', padding: '1.25rem 1.5rem' },
  empty: { textAlign: 'center', color: '#aaa', padding: '2rem 0', fontSize: '0.9rem' },
  errMsg: { color: '#ef4444', fontSize: '0.875rem', padding: '1rem 0' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem',
  },
  card: {
    background: '#f8f9ff', borderRadius: 10, padding: '1rem 1.25rem',
    border: '1px solid #e0e0f0',
  },
  cardTitle: { fontSize: '0.78rem', color: '#888', fontWeight: 500, marginBottom: 4 },
  cardValue: { fontSize: '1.75rem', fontWeight: 700, color: '#111', lineHeight: 1 },
  cardSub: { fontSize: '0.75rem', color: '#aaa', marginTop: 6 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: {
    textAlign: 'left', padding: '8px 10px', background: '#f5f5f7',
    color: '#888', fontWeight: 600, fontSize: '0.78rem',
    borderBottom: '1px solid #e5e7eb',
  },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '8px 10px', color: '#333' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 20,
    color: '#fff', fontSize: '0.7rem', fontWeight: 600,
  },
};
