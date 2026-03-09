import { useState, useEffect } from 'preact/hooks';

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth < 600);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 600);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}
