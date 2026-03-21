import React, { useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LoginForm } from './components/LoginForm';
import { ClipboardFeed } from './components/ClipboardFeed';
import { SyncToggle } from './components/SyncToggle';
import { ShareManager } from './components/ShareManager';
import { DownloadButton } from './components/DownloadButton';
import { useWebSocket } from './hooks/useWebSocket';
import { useClipboardStore } from './store/clipboardStore';
import { endpoints } from './api/endpoints';
import { User, ClipboardItem, ShareInvitation } from './types';
import { WSMessage, ClipboardUpdatePayload } from '@modushare/shared';

// Stable device ID for this browser session
const DEVICE_ID = (() => {
  const stored = sessionStorage.getItem('modushare_device_id');
  if (stored) return stored;
  const id = uuidv4();
  sessionStorage.setItem('modushare_device_id', id);
  return id;
})();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<ShareInvitation[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownFirstCopyToast = useRef(false);

  const { items, addItem, setItems, syncEnabled, setSyncEnabled } =
    useClipboardStore();

  // ─── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── WebSocket message handler ──────────────────────────────────────────────
  const handleWsMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case 'CLIPBOARD_UPDATE': {
          const payload = msg.payload as ClipboardUpdatePayload & {
            itemId?: string;
          };
          const newItem: ClipboardItem = {
            id: payload.itemId ?? uuidv4(),
            userId: user?.id ?? '',
            deviceId: msg.deviceId,
            contentType: payload.contentType,
            contentText: payload.content,
            imageUrl: payload.imageUrl,
            createdAt: msg.timestamp,
            isDeleted: false,
          };
          addItem(newItem);
          break;
        }
        case 'ERROR': {
          const errPayload = msg.payload as { code?: string; message?: string };
          if (errPayload?.code === 'QUOTA_EXCEEDED') {
            showToast('⚠️ ' + (errPayload.message ?? '저장 용량(20MB)을 초과했습니다.'));
          }
          break;
        }
        case 'CLIPBOARD_ACK': {
          if (!hasShownFirstCopyToast.current) {
            hasShownFirstCopyToast.current = true;
            const sharedWithCount = (msg.payload as { sharedWithCount?: number })?.sharedWithCount ?? 0;
            const message = sharedWithCount > 0
              ? `${sharedWithCount}개의 다른 기기와 공유되고 있습니다`
              : '클립보드 동기화가 활성화되어 있습니다';
            showToast(message);
          }
          break;
        }
        case 'SYNC_ENABLE':
          setSyncEnabled(true);
          break;
        case 'SYNC_DISABLE':
          setSyncEnabled(false);
          break;
        case 'SHARE_INVITATION': {
          const inv = msg.payload as { fromId: string; fromUsername: string; fromEmail: string };
          const newInv: ShareInvitation = {
            id: `${inv.fromId}-${Date.now()}`,
            fromId: inv.fromId,
            fromUsername: inv.fromUsername,
            fromEmail: inv.fromEmail,
            createdAt: msg.timestamp,
          };
          setPendingInvitations((prev) => [newInv, ...prev]);
          showToast(`📨 ${inv.fromUsername}님이 클립보드 공유를 요청했습니다`);
          // 실제 id를 서버에서 가져옴
          endpoints.getShareInvitations().then(({ invitations }) => {
            setPendingInvitations(invitations);
          }).catch(() => {});
          break;
        }
        case 'SHARE_ACCEPTED': {
          const acc = msg.payload as { byUsername: string };
          showToast(`✅ ${acc.byUsername}님이 공유 초대를 수락했습니다`);
          break;
        }
        default:
          break;
      }
    },
    [user, addItem, setSyncEnabled, showToast]
  );

  const { isConnected, sendMessage } = useWebSocket({
    token,
    onMessage: handleWsMessage,
    deviceId: DEVICE_ID,
  });

  // ─── After login: load history ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setSyncEnabled(user.syncEnabled);
    setHistoryLoading(true);
    endpoints
      .getHistory(50, 0)
      .then((resp) => setItems(resp.items))
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
    endpoints.getShareInvitations()
      .then(({ invitations }) => setPendingInvitations(invitations))
      .catch(() => {});
  }, [user, setItems, setSyncEnabled]);

  // ─── Listen for auth expiry ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  // ─── Login handler ───────────────────────────────────────────────────────────
  const handleLoginSuccess = (loggedInUser: User, accessToken: string) => {
    setUser(loggedInUser);
    setToken(accessToken);
  };

  // ─── Logout handler ──────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await endpoints.logout();
    } finally {
      setUser(null);
      setToken(null);
      setItems([]);
      hasShownFirstCopyToast.current = false;
    }
  };

  // ─── Sync toggle handler ─────────────────────────────────────────────────────
  const handleSyncToggle = (
    msg: Omit<WSMessage, 'deviceId'> & { deviceId?: string }
  ) => {
    sendMessage(msg);
    setSyncEnabled(msg.type === 'SYNC_ENABLE');
  };

  if (!user || !token) {
    return <LoginForm onSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={styles.shell}>
      {/* ── Toast ── */}
      {toast && (
        <div style={styles.toast} role="status">
          <span style={styles.toastIcon}>📋</span>
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <header style={styles.header}>
        <h1 style={styles.logo}>ModuShare</h1>
        <div style={styles.headerRight}>
          <div
            style={{
              ...styles.dot,
              background: isConnected ? '#22c55e' : '#f59e0b',
            }}
            title={isConnected ? 'Connected' : 'Reconnecting…'}
          />
          <SyncToggle enabled={syncEnabled} onToggle={handleSyncToggle} />
          <ShareManager
            pendingInvitations={pendingInvitations}
            onInvitationHandled={(id) => setPendingInvitations((prev) => prev.filter((i) => i.id !== id))}
          />
          <DownloadButton />
          <span style={styles.username}>{user.username}</span>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={styles.main}>
        <div style={styles.content}>
          <div style={styles.feedHeader}>
            <h2 style={styles.feedTitle}>Clipboard History</h2>
            <span style={styles.count}>{items.length} items</span>
          </div>
          <ClipboardFeed items={items} loading={historyLoading} />
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' },
  toast: {
    position: 'fixed',
    bottom: '1.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1c1c1e',
    color: '#fff',
    padding: '0.65rem 1.25rem',
    borderRadius: 12,
    fontSize: '0.875rem',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    zIndex: 9999,
    whiteSpace: 'nowrap',
    animation: 'fadeInUp 0.25s ease',
  },
  toastIcon: { fontSize: '1rem' },
  header: {
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
    padding: '0 1.5rem',
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  logo: { fontSize: '1.25rem', fontWeight: 700, color: '#6366f1' },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  username: {
    fontSize: '0.875rem',
    color: '#555',
    fontWeight: 500,
  },
  logoutBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #d1d1d6',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '0.8125rem',
  },
  main: { flex: 1, padding: '1.5rem', background: '#f5f5f7' },
  content: { maxWidth: 720, margin: '0 auto' },
  feedHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  feedTitle: { fontSize: '1.125rem', fontWeight: 600 },
  count: { fontSize: '0.8125rem', color: '#aaa' },
};
