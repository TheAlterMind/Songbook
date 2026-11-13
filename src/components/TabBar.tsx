import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeContext';
import { ICON, LAYOUT } from '../theme/tokens';
import { PlusIcon } from './Icons';

const ADD_SIZE = 68; // button plus ring, rising LAYOUT.tabProtrude above the bar and ending 4px above its bottom edge
const ADD_RING = 4; // drawn inside ADD_SIZE, so the visible button is 60

/**
 * The bottom menu: List, Collections, a + button that rises a little above the bar, Tools, Settings.
 * Those four are screens; + opens Find lyrics. Google Drive syncs by itself (see sync/AutoSync) and signing in
 * lives in Settings.
 */
export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = navigation as any;

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
    <View pointerEvents="box-none" style={{ height: LAYOUT.tabProtrude + LAYOUT.tabBar + insets.bottom }}>
      <View style={[styles.bar, { height: LAYOUT.tabBar + insets.bottom, backgroundColor: colors.menuBg }]} />
      <View style={[styles.row, { top: LAYOUT.tabProtrude, height: LAYOUT.tabBar }]}>
        {screenTab('Library')}
        {screenTab('Collections')}
        <View style={styles.slot} />
        {screenTab('Tools')}
        {screenTab('Settings')}
      </View>
      <TouchableOpacity
        onPress={() => nav.navigate('WebSearch', { query: '' })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add song"
        style={[styles.add, { backgroundColor: colors.accent, borderColor: colors.bg, marginLeft: -ADD_SIZE / 2 }]}
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
    top: 0,
    left: '50%',
    width: ADD_SIZE,
    height: ADD_SIZE,
    borderRadius: ADD_SIZE / 2,
    // The ring matches the screen behind it, so the button looks cut out of the bar.
    borderWidth: ADD_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
