import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, Animated, PanResponder, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { TYPE } from '../theme/tokens';

export type SwipeAction = { label: string; background: string; color: string; onPress: () => void };
export type SwipeRowHandle = { open: () => void; close: () => void; isOpen: () => boolean };

const ACTION_WIDTH = 84;
const LEFT_WIDTH = 96;
const useNative = Platform.OS !== 'web';

// Only one row is open at a time: opening a row closes the one before it.
let closeOther: (() => void) | null = null;

/** Whether some row is showing its buttons right now. */
export function isAnyRowOpen(): boolean {
  return closeOther != null;
}

/** Closes the open row, if any. */
export function closeOpenRow(): void {
  closeOther?.();
}

/**
 * A row that slides to reveal buttons behind it. A swipe left shows `rightActions` (buttons on the right edge), a
 * swipe right shows `leftAction` (a button on the left edge). The row stays open until closed or a button is
 * pressed, so nothing happens by accident. Either side can be left out. `open()` opens the right-hand buttons from
 * code (the Library uses a long press).
 * Vertical drags are left to the list.
 */
const SwipeRow = forwardRef<
  SwipeRowHandle,
  { leftAction?: SwipeAction; rightActions?: SwipeAction[]; radius: number; children: React.ReactNode }
>(function SwipeRow({ leftAction, rightActions = [], radius, children }, ref) {
  const rightWidth = ACTION_WIDTH * rightActions.length;
  const x = useRef(new Animated.Value(0)).current;
  const leftWidth = leftAction ? LEFT_WIDTH : 0;
  // Where the row rests: 0 closed, -rightWidth showing the right buttons, leftWidth showing the left one.
  const restRef = useRef(0);
  const isOpenRef = useRef(false);
  const startRef = useRef(0);

  // A stable identity for this row's close function, so closeOther can tell whether it is this row's.
  const closeRef = useRef<() => void>(() => {});
  const closeSelf = useRef(() => closeRef.current()).current;
  closeRef.current = () => close();

  const slideTo = (value: number) => Animated.timing(x, { toValue: value, duration: 160, useNativeDriver: useNative }).start();

  const openTo = (target: number) => {
    if (closeOther && closeOther !== closeSelf) closeOther();
    closeOther = closeSelf;
    isOpenRef.current = true;
    restRef.current = target;
    slideTo(target);
  };
  const open = () => {
    if (rightWidth > 0) openTo(-rightWidth);
  };
  const close = () => {
    isOpenRef.current = false;
    restRef.current = 0;
    if (closeOther === closeSelf) closeOther = null;
    slideTo(0);
  };

  useImperativeHandle(ref, () => ({ open, close, isOpen: () => isOpenRef.current }));

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
          startRef.current = restRef.current;
          if (!isOpenRef.current && closeOther && closeOther !== closeSelf) closeOther();
        },
        onPanResponderMove: (_, g) => {
          const min = rightWidth > 0 ? -rightWidth - 16 : 0;
          const max = leftWidth > 0 ? leftWidth + 16 : 0;
          x.setValue(Math.max(min, Math.min(max, startRef.current + g.dx)));
        },
        onPanResponderRelease: (_, g) => {
          const end = startRef.current + g.dx;
          if (rightWidth > 0 && (end < -rightWidth / 2 || (g.vx < -0.5 && end < 0))) openTo(-rightWidth);
          else if (leftWidth > 0 && (end > leftWidth / 2 || (g.vx > 0.5 && end > 0))) openTo(leftWidth);
          else close();
        },
        onPanResponderTerminate: () => close(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rightWidth, leftWidth]
  );

  // The layers behind the row are invisible until the row has actually slid to that side. Otherwise they show
  // through the row whenever it is translucent, for example while the screen fades during a navigation.
  const leftOpacity = x.interpolate({ inputRange: [0, 6], outputRange: [0, 1], extrapolate: 'clamp' });
  const actionsOpacity = x.interpolate({ inputRange: [-6, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ borderRadius: radius, overflow: 'hidden' }}>
      {leftAction && (
        <Animated.View style={[styles.left, { width: leftWidth, opacity: leftOpacity }]}>
          <TouchableOpacity
            onPress={() => {
              close();
              leftAction.onPress();
            }}
            style={[styles.action, { backgroundColor: leftAction.background }]}
          >
            <Text numberOfLines={2} style={{ fontSize: TYPE.small, fontWeight: '500', color: leftAction.color, textAlign: 'center' }}>
              {leftAction.label}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      {rightActions.length > 0 && (
        <Animated.View style={[styles.actions, { width: rightWidth, opacity: actionsOpacity }]}>
          {rightActions.map((a) => (
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
        </Animated.View>
      )}
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
});

export default SwipeRow;

const styles = StyleSheet.create({
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  left: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
