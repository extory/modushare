import { useCallback } from 'react';

export function useClipboard() {
  const copyText = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand('copy');
        return true;
      } finally {
        document.body.removeChild(el);
      }
    }
  }, []);

  const copyImageUrl = useCallback(async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { copyText, copyImageUrl };
}
