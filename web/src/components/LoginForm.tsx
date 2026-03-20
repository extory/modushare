import React, { useState, useEffect, useRef } from 'react';
import { endpoints } from '../api/endpoints';
import { User } from '../types';

interface LoginFormProps {
  onSuccess: (user: User, token: string) => void;
}

type Mode = 'login' | 'register';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (element: HTMLElement, config: object) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string ?? '';

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // ── Google 버튼 초기화 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const init = () => {
      if (!window.google || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        text: 'continue_with',
        size: 'large',
        width: 340,
        logo_alignment: 'left',
      });
    };

    // GSI 스크립트가 이미 로드된 경우 즉시, 아니면 로드 후 실행
    if (window.google) {
      init();
    } else {
      const script = document.querySelector('script[src*="accounts.google.com/gsi"]');
      script?.addEventListener('load', init);
    }
  }, []);

  const handleGoogleCallback = async (response: { credential: string }) => {
    setError('');
    setLoading(true);
    try {
      const result = await endpoints.googleLogin(response.credential);
      onSuccess(result.user, result.accessToken);
    } catch {
      setError('Google 로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result =
        mode === 'login'
          ? await endpoints.login(email, password)
          : await endpoints.register(username, email, password);
      onSuccess(result.user, result.accessToken);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? '로그인에 실패했습니다. 다시 시도해주세요.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>ModuShare</h1>
        <p style={styles.subtitle}>모든 기기에서 클립보드를 동기화하세요</p>

        {/* Google 로그인 버튼 */}
        {GOOGLE_CLIENT_ID && (
          <>
            <div style={styles.googleWrap}>
              <div ref={googleBtnRef} />
            </div>
            <div style={styles.divider}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>또는</span>
              <span style={styles.dividerLine} />
            </div>
          </>
        )}

        {/* 이메일/비밀번호 탭 */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.activeTab : {}) }}
            onClick={() => setMode('login')}
          >
            로그인
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.activeTab : {}) }}
            onClick={() => setMode('register')}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>사용자 이름</label>
              <input
                style={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                required
                minLength={3}
              />
            </div>
          )}
          <div style={styles.field}>
            <label style={styles.label}>이메일</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>비밀번호</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? '처리 중…' : mode === 'login' ? '로그인' : '계정 만들기'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '1rem',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '2.5rem',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: '0.25rem',
    color: '#1d1d1f',
  },
  subtitle: {
    textAlign: 'center',
    color: '#6e6e73',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
  },
  googleWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1.25rem',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.25rem',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: '#e0e0e0',
    display: 'block',
  },
  dividerText: {
    fontSize: '0.8125rem',
    color: '#999',
    whiteSpace: 'nowrap',
  },
  tabs: {
    display: 'flex',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #e0e0e0',
    marginBottom: '1.5rem',
  },
  tab: {
    flex: 1,
    padding: '0.6rem',
    border: 'none',
    background: '#f5f5f7',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
    transition: 'background 0.2s',
  },
  activeTab: {
    background: '#6366f1',
    color: '#fff',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.8125rem', fontWeight: 500, color: '#444' },
  input: {
    padding: '0.625rem 0.75rem',
    borderRadius: 8,
    border: '1px solid #d1d1d6',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    color: '#ef4444',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    borderRadius: 8,
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};
