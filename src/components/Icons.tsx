import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

type IconProps = { color?: string; size?: number };

// Library header  compact view toggle. Design: viewBox 16x14, 4 bars.
export function CompactViewIcon({ color = '#000', size = 16 }: IconProps) {
  const h = (size / 16) * 14;
  return (
    <Svg width={size} height={h} viewBox="0 0 16 14">
      <Rect y="0" width="16" height="1.5" fill={color} />
      <Rect y="4" width="16" height="1.5" fill={color} />
      <Rect y="8" width="16" height="1.5" fill={color} />
      <Rect y="12" width="16" height="1.5" fill={color} />
    </Svg>
  );
}

// Library header  expanded view toggle. Design: viewBox 16x14, 3 bars.
export function ExpandedViewIcon({ color = '#000', size = 16 }: IconProps) {
  const h = (size / 16) * 14;
  return (
    <Svg width={size} height={h} viewBox="0 0 16 14">
      <Rect y="0" width="16" height="2" fill={color} />
      <Rect y="6" width="16" height="2" fill={color} />
      <Rect y="12" width="16" height="2" fill={color} />
    </Svg>
  );
}

// Sort direction  up chevron. Design: viewBox 10x7.
export function SortUpIcon({ color = '#000', size = 10 }: IconProps) {
  const h = (size / 10) * 7;
  return (
    <Svg width={size} height={h} viewBox="0 0 10 7">
      <Path d="M1 6l4-5 4 5" stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Sort direction  down chevron. Design: viewBox 10x7.
export function SortDownIcon({ color = '#000', size = 10 }: IconProps) {
  const h = (size / 10) * 7;
  return (
    <Svg width={size} height={h} viewBox="0 0 10 7">
      <Path d="M1 1l4 5 4-5" stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Favorite star. Design: viewBox 24x24, fill driven by favorite state.
export function StarIcon({ color = '#000', size = 18, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

// FAB plus. Design: viewBox 20x20.
export function PlusIcon({ color = '#000', size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M10 2v16M2 10h16" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// Search (used both in the Search screen field and the header icon button). Design: viewBox 24x24.
export function SearchIcon({ color = '#000', size = 15, strokeWidth = 2 }: IconProps & { strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Path d="M21 21l-4.3-4.3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// List-row chevron. Design: viewBox 8x14.
export function ChevronRightIcon({ color = '#000', size = 14 }: IconProps) {
  const w = (size / 14) * 8;
  return (
    <Svg width={w} height={size} viewBox="0 0 8 14">
      <Path d="M1 1l6 6-6 6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Back chevron. Design: viewBox 11x18.
export function BackChevronIcon({ color = '#000', size = 18 }: IconProps) {
  const w = (size / 18) * 11;
  return (
    <Svg width={w} height={size} viewBox="0 0 11 18">
      <Path d="M9 1L1.5 9l7.5 8" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Edit pencil. Design: viewBox 24x24.
export function EditPencilIcon({ color = '#000', size = 17 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 21l3.6-.9L21 5.7 18.3 3 3.9 17.4 3 21z" fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}

// ---- Tab bar icons (all viewBox 24x24, from the design's tab bar) ----

export function LibraryTabIcon({ color = '#000', size = 19 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 4h7v16H4a1 1 0 01-1-1V5a1 1 0 011-1zM13 4h7a1 1 0 011 1v14a1 1 0 01-1 1h-7z"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchTabIcon({ color = '#000', size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={1.8} fill="none" />
      <Path d="M21 21l-4.3-4.3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function CollectionsTabIcon({ color = '#000', size = 19 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="4" width="18" height="4" rx="1" stroke={color} strokeWidth={1.7} fill="none" />
      <Rect x="3" y="10" width="18" height="4" rx="1" stroke={color} strokeWidth={1.7} fill="none" />
      <Rect x="3" y="16" width="18" height="4" rx="1" stroke={color} strokeWidth={1.7} fill="none" />
    </Svg>
  );
}

export function SettingsTabIcon({ color = '#000', size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.7} fill="none" />
      <Path
        d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}
