import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, Animated, PanResponder, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { TYPE } from '../theme/tokens';

export type SwipeAction = { label: string; background: string; color: string; onPress: () => void };
export type SwipeRowHandle = { open: () => void; close: () => void; isOpen: () => boolean };

const ACTION_WIDTH = 84;
const useNative = Platform.OS !== 'web';

// Only one row is open at a time: opening a row closes the one before it.
let closeOther: (() => void) | null = null;

/**
 * A row that slides left to show action buttons behind it. A horizontal drag opens it; `open()` does the same
 * from code (the Library uses a long press). Vertical drags are left to the list.
 */
const SwipeRow = forwardRef<SwipeRowHandle, { actions: SwipeAction[]; radius: number; children: React.ReactNode }>(
  function SwipeRow({ actions, radius, children }, ref) {
    const width = ACTION_WIDTH * actions.length;
    const x = useRef(new Animated.Value(0)).current;
    const openRef = useRef(false);
    const startRef = useRef(0);

    // A stable identity for this row's close function, so closeOther can tell whether it is this row's.
    const closeRef = useRef<() => void>(() => {});
    const closeSelf = useRef(() => closeRef.current()).current;
    closeRef.current = () => close();

    const open = () => {
      if (closeOther && closeOther !== closeSelf) closeOther();
      closeOther = closeSelf;
      openRef.current = true;
      Animated.timing(x, { toValue: -width, duration: 160, useNativeDriver: useNative }).start();
    };
    const close = () => {
      openRef.current = false;
      if (closeOther === closeSelf) closeOther = null;
      Animated.timing(x, { toValue: 0, duration: 160, useNativeDriver: useNative }).start();
    };

    useImperativeHandle(ref, () => ({ open, close, isOpen: () => openRef.current }));

    useEffect(
      () => () => {
        if (closeOther === closeSelf) closeOther = null;
      },
      []
    );

    const pan = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            startRef.current = openRef.current ? -width : 0;
            if (!openRef.current && closeOther && closeOther !== closeSelf) closeOther();
          },
          onPanResponderMove: (_, g) => {
            x.setValue(Math.max(-width - 16, Math.min(0, startRef.current + g.dx)));
          },
          onPanResponderRelease: (_, g) => {
            const end = startRef.current + g.dx;
            if (end < -width / 2 || g.vx < -0.5) open();
            else close();
          },
          onPanResponderTerminate: () => close(),
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [width]
    );

    return (
      <View style={{ borderRadius: radius, overflow: 'hidden' }}>
        <View style={[styles.actions, { width }]}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.label}
              onPress={() => {
                close();
                a.onPress();
              }}
              style={[styles.action, { backgroundColor: a.background }]}
            >
              <Text numberOfLines={1} style={{ fontSize: TYPE.small, fontWeight: '500', color: a.color }}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
          {children}
        </Animated.View>
      </View>
    );
  }
);

export default SwipeRow;

const styles = StyleSheet.create({
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
