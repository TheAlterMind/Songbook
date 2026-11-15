import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeContext';
import { ICON, LAYOUT } from '../theme/tokens';
import { PlusIcon, DiceIcon } from './Icons';
import { getAllSongs } from '../db/Database';
import { notify, errorText } from '../utils/notify';

const ADD_SIZE = 60; // the button rises above the bar and ends 4px above its bottom edge
const ADD_TOP = 4; // no ring: the bar and the page behind it are different shades, so a ring in either would show as a notch

/**
 * The height the bottom menu takes, including the part where the + button rises. The menu floats over the screens
 * (so songs show beside the button); a screen with a list or scroll view adds this to its bottom padding.
 */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return LAYOUT.tabProtrude + LAYOUT.tabBar + insets.bottom;
}

/**
 * The bottom menu: List, Collections, a + button that rises a little above the bar, a dice, Settings.
 * List, Collections and Settings are screens; + opens Find lyrics and the dice opens a random song. The Tools
 * screen is a tab that has no button: Settings opens it. Google Drive syncs by itself (see sync/AutoSync) and signing in
 * lives in Settings.
 */
export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = navigation as any;

  // The dice: opens a song picked at random from the whole library.
  const pickRandomSong = async () => {
    try {
      const songs = await getAllSongs();
      if (songs.length === 0) {
        notify('No songs yet', 'Add a song first, then the dice can pick one for you.');
        return;
      }
      const song = songs[Math.floor(Math.random() * songs.length)];
      nav.navigate('Detail', { songId: song.id });
    } catch (e) {
      notify("Couldn't pick a song", errorText(e));
    }
  };

  const screenTab = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    const focused = state.routes[state.index]?.key === route.key;
    const options = descriptors[route.key].options;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) nav.navigate(route.name, route.params);
    };
    return (
      <TouchableOpacity
        key={route.key}
        style={styles.slot}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={options.title ?? route.name}
        accessibilityState={{ selected: focused }}
      >
        {options.tabBarIcon?.({ focused, color: focused ? colors.accent : colors.neutral500, size: ICON.tab })}
      </TouchableOpacity>
    );
  };

  return (
    // The transparent top part leaves room for the + button, and keeps its whole area tappable.
    // Absolute, so the navigator reserves no room for it: the screens run to the bottom edge and the list shows
    // through the transparent part beside the + button. Screens add useTabBarSpace to their bottom padding.
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: LAYOUT.tabProtrude + LAYOUT.tabBar + insets.bottom }}
    >
      <View style={[styles.bar, { height: LAYOUT.tabBar + insets.bottom, backgroundColor: colors.menuBg, borderTopWidth: 1, borderTopColor: colors.well }]} />
      <View style={[styles.row, { top: LAYOUT.tabProtrude, height: LAYOUT.tabBar }]}>
        {screenTab('Library')}
        {screenTab('Collections')}
        <View style={styles.slot} />
        <TouchableOpacity style={styles.slot} onPress={pickRandomSong} accessibilityRole="button" accessibilityLabel="Random song">
          <DiceIcon color={colors.neutral500} size={ICON.tab} />
        </TouchableOpacity>
        {screenTab('Settings')}
      </View>
      <TouchableOpacity
        onPress={() => nav.navigate('WebSearch', { query: '' })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add song"
        style={[styles.add, { backgroundColor: colors.accent, marginLeft: -ADD_SIZE / 2 }]}
      >
        <PlusIcon color={colors.accent100} size={ICON.button + 10} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  row: { position: 'absolute', left: 0, right: 0, flexDirection: 'row' },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  add: {
    position: 'absolute',
    top: ADD_TOP,
    left: '50%',
    width: ADD_SIZE,
    height: ADD_SIZE,
    borderRadius: ADD_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
