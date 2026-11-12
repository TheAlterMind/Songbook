import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { LAYOUT } from './tokens';

// Scales the whole interface with the window, the way Sitness does: a 16px base up to an
// 800px-tall window (so a phone is unchanged), then growing with it, capped by the width.
//
// On web the scale is applied with CSS zoom on <html>, so every size (type, icons, spacing)
// grows together, like Sitness's rem-based CSS. Native screens keep the base sizes.

/** Sitness's "Interface size" choices: a multiplier on top of the automatic size. */
export const SCALE_CHOICES = [
  { label: 'Smaller', value: 0.85 },
  { label: 'Automatic', value: 1 },
  { label: 'Larger', value: 1.25 },
  { label: 'Largest', value: 1.5 },
];

/** Interface scaling needs CSS zoom, so the setting only exists on web. */
export const CAN_SCALE = Platform.OS === 'web';

/** Root size for a window: 2% of its height, capped by 4.4% of its width, never below 16px. */
export function rootSize(width: number, height: number, user = 1): number {
  return Math.min(Math.max(16, Math.min(0.02 * height, 0.044 * width)) * user, 96);
}

type Scale = { scale: number; wide: boolean };

function webWindow(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useInterfaceScale(userScale = 1): Scale {
  const user = SCALE_CHOICES.some((c) => c.value === userScale) ? userScale : 1;
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
  const scale = CAN_SCALE ? rootSize(width, height, user) / 16 : 1;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.documentElement.style.setProperty('zoom', String(scale));
  }, [scale]);

  // The window as the interface sees it: how many 16px units fit across.
  return { scale, wide: width / scale >= LAYOUT.wideAt };
}
