import React, { useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LoginForm } from './components/LoginForm';
import { ClipboardFeed } from './components/ClipboardFeed';
import { SyncToggle } from './components/SyncToggle';
import { ShareManager } from './components/ShareManager';
import { DownloadButton } from './components/DownloadButton';
import { AdminPanel } from './components/AdminPanel';
import { TermsOfService } from './components/TermsOfService';
import { PrivacyPolicy } from './components/PrivacyPolicy';
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

// ─── Simple hash-based routing for legal pages ───────────────────────────────
function useHash() {
  const [hash, setHash] = React.useState(window.location.hash);
  React.useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  if (hash === '#/terms') return <TermsOfService />;
  if (hash === '#/privacy') return <PrivacyPolicy />;

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<ShareInvitation[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [versionBanner, setVersionBanner] = useState<{ peerVersion: string; downloadUrl: string } | null>(null);
  const versionBannerShown = React.useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownFirstCopyToast = useRef(false);

  const [authLoading, setAuthLoading] = useState(true);

  const { items, addItem, setItems, syncEnabled, setSyncEnabled } =
    useClipboardStore();

  // ─── Auto-restore session on mount ──────────────────────────────────────────
  useEffect(() => {
    endpoints.refresh().then((result) => {
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
      }
    }).finally(() => setAuthLoading(false));
  }, []);

  // ─── Version mismatch banner (최초 1회) ─────────────────────────────────────
  const showVersionMismatchToast = useCallback((peerVersion: string, downloadUrl: string) => {
    if (versionBannerShown.current) return;
    versionBannerShown.current = true;
    setVersionBanner({ peerVersion, downloadUrl });
  }, []);

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
            senderEmail?: string;
          };
          const newItem: ClipboardItem = {
            id: payload.itemId ?? uuidv4(),
            userId: user?.id ?? '',
            deviceId: msg.deviceId,
            contentType: payload.contentType,
            contentText: payload.content,
            imageUrl: payload.imageUrl,
            fileUrl: payload.fileUrl,
            fileName: payload.fileName,
            fileSize: payload.fileSize,
            createdAt: msg.timestamp,
            isDeleted: false,
          };
          addItem(newItem);
          // Show toast when a partner copies something (not our own device)
          if (payload.senderEmail && payload.senderEmail !== user?.email) {
            const typeLabel = payload.contentType === 'image' ? 'image'
              : payload.contentType === 'file' ? 'file'
              : 'text';
            showToast(`${payload.senderEmail} copied ${typeLabel}`);
          }
          break;
        }
        case 'ERROR': {
          const errPayload = msg.payload as { code?: string; message?: string };
          if (errPayload?.code === 'QUOTA_EXCEEDED') {
            showToast('⚠️ ' + (errPayload.message ?? '저장 용량(20MB)을 초과했습니다.'));
          } else if (errPayload?.code === 'IMAGE_TOO_LARGE' || errPayload?.code === 'TOO_LARGE') {
            showToast('⚠️ 최대 5MB까지 공유할 수 있습니다.');
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
        case 'VERSION_MISMATCH': {
          const vm = msg.payload as { myVersion?: string; peerVersion?: string; downloadUrl?: string };
          const url = vm.downloadUrl ?? 'https://github.com/extory/modushare/releases/latest';
          showVersionMismatchToast(vm.peerVersion ?? '', url);
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

  // ─── Auto-prune items older than 10 minutes ──────────────────────────────────
  const { removeItem } = useClipboardStore();
  useEffect(() => {
    const EXPIRY_MS = 10 * 60 * 1000;
    const timer = setInterval(() => {
      const now = Date.now();
      items.forEach((item) => {
        if (now - item.createdAt > EXPIRY_MS) {
          removeItem(item.id);
        }
      });
    }, 30_000); // check every 30s
    return () => clearInterval(timer);
  }, [items, removeItem]);

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

  // ─── File/image share handler (mobile) ───────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      showToast('⚠️ 최대 5MB까지 공유할 수 있습니다.');
      return;
    }

    setUploading(true);
    try {
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const { imageUrl } = await endpoints.uploadImage(file);
        sendMessage({
          type: 'CLIPBOARD_UPDATE',
          payload: { contentType: 'image', imageUrl },
          timestamp: Date.now(),
        });
      } else {
        const { fileUrl, fileName, fileSize } = await endpoints.uploadFile(file);
        sendMessage({
          type: 'CLIPBOARD_UPDATE',
          payload: { contentType: 'file', fileUrl, fileName, fileSize } as never,
          timestamp: Date.now(),
        });
      }
      showToast('공유되었습니다.');
    } catch {
      showToast('⚠️ 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  if (authLoading) return null;

  if (!user || !token) {
    return <LoginForm onSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={styles.shell}>
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      {/* ── Version mismatch banner ── */}
      {versionBanner && (
        <div style={styles.versionBanner}>
          <span>🔔 연결된 기기가 더 최신 버전({versionBanner.peerVersion})을 사용 중입니다. 업그레이드를 권장합니다.</span>
          <a
            href={versionBanner.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.versionBannerLink}
          >
            최신 버전 다운로드 →
          </a>
          <button style={styles.versionBannerClose} onClick={() => setVersionBanner(null)}>✕</button>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={styles.toast} role="status">
          <span style={styles.toastIcon}>📋</span>
          {toast}
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,*/*"
        style={{ display: 'none' }}
        onChange={handleFileShare}
      />

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
          <button
            style={{ ...styles.uploadBtn, opacity: uploading ? 0.6 : 1 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Share image or file (max 5MB)"
          >
            {uploading ? '…' : '+ Share'}
          </button>
          <ShareManager
            pendingInvitations={pendingInvitations}
            onInvitationHandled={(id) => setPendingInvitations((prev) => prev.filter((i) => i.id !== id))}
          />
          <DownloadButton />
          {user.role === 'admin' && (
            <button style={styles.adminBtn} onClick={() => setShowAdmin(true)}>
              Admin
            </button>
          )}
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

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <span>© 2026 Extory. All rights reserved.</span>
        <span style={styles.footerSep}>·</span>
        <a href="#/terms" style={styles.footerLink}>Terms of Service</a>
        <span style={styles.footerSep}>·</span>
        <a href="#/privacy" style={styles.footerLink}>Privacy Policy</a>
      </footer>
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
  adminBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #6366f1',
    background: '#6366f1',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  logoutBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #d1d1d6',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '0.8125rem',
  },
  uploadBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #6366f1',
    background: '#fff',
    color: '#6366f1',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
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
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '1rem',
    fontSize: '0.75rem',
    color: '#aaa',
    borderTop: '1px solid #e5e7eb',
    background: '#fff',
  },
  footerSep: { color: '#ddd' },
  footerLink: { color: '#aaa', textDecoration: 'none' },
  versionBanner: {
    background: '#fffbeb',
    borderBottom: '1px solid #fcd34d',
    padding: '0.6rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.875rem',
    color: '#92400e',
    flexWrap: 'wrap' as const,
  },
  versionBannerLink: {
    color: '#6366f1',
    fontWeight: 600,
    textDecoration: 'none',
    marginLeft: 'auto',
    whiteSpace: 'nowrap' as const,
  },
  versionBannerClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#92400e',
    fontSize: '1rem',
    padding: '0 4px',
    lineHeight: 1,
  },
};
