import React, { useState, useRef, useEffect } from 'react';

const REPO = 'extory/modushare';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

export function DownloadButton({ isMobile }: { isMobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (release) return;
    setLoading(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      const data: Release = await res.json();
      setRelease(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const macAsset = release?.assets.find((a) => a.name.endsWith('.zip') && a.name.includes('mac'));
  const winAsset = release?.assets.find((a) => a.name.endsWith('.exe') || a.name.endsWith('.msi') || a.name.endsWith('Setup.exe'));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button style={isMobile ? styles.iconBtn : styles.btn} onClick={handleOpen} title="클라이언트 다운로드">
        {isMobile ? '⬇️' : '↓ 다운로드'}
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.version}>
            {loading ? '로딩 중…' : release ? `최신 버전: ${release.tag_name}` : '버전 정보 없음'}
          </div>
          <a
            href={macAsset?.browser_download_url ?? '#'}
            style={{ ...styles.item, ...(macAsset ? {} : styles.itemDisabled) }}
            onClick={macAsset ? () => setOpen(false) : (e) => e.preventDefault()}
            download
          >
            🍎 macOS 다운로드
          </a>
          <a
            href={winAsset?.browser_download_url ?? '#'}
            style={{ ...styles.item, ...(winAsset ? {} : styles.itemDisabled) }}
            onClick={winAsset ? () => setOpen(false) : (e) => e.preventDefault()}
            download
          >
            🪟 Windows 다운로드
          </a>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  iconBtn: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #e0e0e0',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    minHeight: 36,
  },
  btn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #6366f1',
    background: '#fff',
    color: '#6366f1',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 500,
  },
  dropdown: {
    position: 'fixed',
    right: 8,
    top: 64,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: 200,
    zIndex: 200,
    overflow: 'hidden',
  },
  version: {
    padding: '8px 14px',
    fontSize: '0.75rem',
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
  },
  item: {
    display: 'block',
    padding: '10px 14px',
    fontSize: '0.875rem',
    color: '#1d1d1f',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  itemDisabled: {
    color: '#aaa',
    cursor: 'default',
  },
};
