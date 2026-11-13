import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Animated, Easing, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeContext';
import { ICON, LAYOUT } from '../theme/tokens';
import { CloudTabIcon, PlusIcon } from './Icons';
import { useToast } from './Toast';
import { isSignedIn, isSyncConfigured, NotSignedInError } from '../sync/googleAuth';
import { syncNow } from '../sync/syncService';
import { errorText, notify } from '../utils/notify';

const ADD_SIZE = 68; // button plus ring, rising LAYOUT.tabProtrude above the bar and ending 4px above its bottom edge
const ADD_RING = 4; // drawn inside ADD_SIZE, so the visible button is 60

/**
 * The bottom menu: List, Collections, a + button that rises a little above the bar, a cloud for Google Drive sync, Settings.
 * Only List, Collections and Settings are screens; + opens the Add screen and the cloud runs a sync.
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
        <CloudButton refreshKey={state.index} openSettings={() => nav.navigate('Settings')} />
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

/** Signs in to Google when needed, then syncs. A dot on the cloud shows that this device is signed in. */
function CloudButton({ refreshKey, openSettings }: { refreshKey: number; openSettings: () => void }) {
  const { colors } = useTheme();
  const { showMessage } = useToast();
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  // Settings can sign out, so look again whenever the user moves between tabs.
  useEffect(() => {
    isSignedIn()
      .then(setSignedIn)
      .catch(() => setSignedIn(false));
  }, [refreshKey]);

  useEffect(() => {
    if (!busy) {
      pulse.setValue(1);
      return;
    }
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [busy, pulse]);

  const onPress = async () => {
    if (busy) return;
    // A build without a Google client id has nothing to sign in to: Settings explains what is missing.
    if (!isSyncConfigured()) return openSettings();
    setBusy(true);
    try {
      const count = await syncNow(true);
      setSignedIn(true);
      showMessage(`Synced: ${count} ${count === 1 ? 'song' : 'songs'}`);
    } catch (e) {
      // Closing the Google sign-in screen is not an error worth a dialog.
      if (!(e instanceof NotSignedInError)) notify('Sync failed', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.slot}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={signedIn ? 'Sync with Google Drive' : 'Sign in to Google Drive'}
    >
      <Animated.View style={{ opacity: pulse }}>
        <CloudTabIcon color={colors.neutral500} size={ICON.tab} />
        {signedIn && <View style={[styles.dot, { backgroundColor: colors.accent, borderColor: colors.menuBg }]} />}
      </Animated.View>
    </TouchableOpacity>
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
  dot: { position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5 },
});
