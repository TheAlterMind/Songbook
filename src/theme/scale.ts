import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { LAYOUT } from './tokens';

// Scales the whole interface with the window, the way Sitness does: a 16px base up to an
// 800px-tall window (so a phone is unchanged), then growing with it, capped by the width.
//
// On web the scale is applied with CSS zoom on <html>, so every size (type, icons, spacing)
// grows together, like Sitness's rem-based CSS. Native screens keep the base sizes.

/** Root size for a window: 2% of its height, capped by 4.4% of its width, never below 16px. */
export function rootSize(width: number, height: number): number {
  return Math.min(Math.max(16, Math.min(0.02 * height, 0.044 * width)), 96);
}

type Scale = { scale: number; wide: boolean };

function webWindow(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useInterfaceScale(): Scale {
  const native = useWindowDimensions();
  // On web, read the real window: the zoom changes what the page's own dimensions report.
  const [web, setWeb] = useState(() => (Platform.OS === 'web' ? webWindow() : null));

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onResize = () => setWeb(webWindow());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const { width, height } = web ?? native;
  const scale = Platform.OS === 'web' ? rootSize(width, height) / 16 : 1;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.documentElement.style.setProperty('zoom', String(scale));
  }, [scale]);

  // The window as the interface sees it: how many 16px units fit across.
  return { scale, wide: width / scale >= LAYOUT.wideAt };
}
