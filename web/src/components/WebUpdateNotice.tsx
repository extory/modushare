import { useEffect, useState } from 'react';

export function WebUpdateNotice() {
  const [newBuild, setNewBuild] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    const currentBuild = import.meta.env['VITE_WEB_BUILD_ID'];
    if (!import.meta.env.PROD || !currentBuild) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (active && typeof data.buildId === 'string' && /^[0-9a-f-]{36}$/.test(data.buildId)) {
          setNewBuild(data.buildId !== currentBuild ? data.buildId : null);
        }
      } catch { /* An offline/failed check is not an update. */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    const timer = setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  if (!newBuild || newBuild === dismissed) return null;
  return <div role="status" style={{ padding: '12px 20px', background: '#eef2ff', display: 'flex', gap: 12, alignItems: 'center' }}>
    <span>새 웹 버전이 배포되었습니다. 새로고침하면 적용됩니다.</span>
    <button onClick={() => window.location.reload()}>새로고침</button>
    <button aria-label="웹 업데이트 알림 닫기" onClick={() => setDismissed(newBuild)}>나중에</button>
  </div>;
}
