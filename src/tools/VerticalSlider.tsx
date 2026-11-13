import React, { useMemo, useRef } from 'react';
import { View, PanResponder, Platform } from 'react-native';
import { Text } from '../components/Typography';

// A 3px track with an accent fill, and a round head styled like the Tap tempo ring that shows the value.
const KNOB = 68; // the same as the raised + button in the bottom menu
const TOUCH = KNOB;
const TRACK = 3;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  height: number;
  /** Spoken name for screen readers. */
  label: string;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  /** Colour of the number inside the head. */
  valueColor: string;
  /** Called with true when the head is grabbed and false when it is let go. */
  onHold?: (held: boolean) => void;
};

/**
 * A vertical slider for whole numbers: the top is `max`, the bottom is `min`. Touching the track jumps the thumb to
 * that spot and dragging moves it from there. React Native has no slider of its own, and this one behaves the same
 * on a phone, in the browser and in the desktop app.
 */
export default function VerticalSlider({ value, min, max, onChange, height, label, trackColor, fillColor, thumbColor, valueColor, onHold }: Props) {
  const travel = height - TOUCH; // how far the middle of the thumb can move
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const startValue = useRef(value);
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;

  const pan = useMemo(() => {
    const fromTop = (y: number) => Math.round(min + (1 - clamp((y - TOUCH / 2) / travel, 0, 1)) * (max - min));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startValue.current = fromTop(e.nativeEvent.locationY);
        onChangeRef.current(startValue.current);
        onHoldRef.current?.(true);
      },
      onPanResponderRelease: () => onHoldRef.current?.(false),
      onPanResponderTerminate: () => onHoldRef.current?.(false),
      onPanResponderMove: (_, g) => {
        onChangeRef.current(clamp(Math.round(startValue.current - (g.dy / travel) * (max - min)), min, max));
      },
    });
  }, [min, max, travel]);

  const shown = clamp(value, min, max);
  const thumbTop = (1 - (shown - min) / (max - min)) * travel; // top edge of the touch area
  const web = Platform.OS === 'web';

  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: shown }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const by = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        onChangeRef.current(clamp(shown + by, min, max));
      }}
      // touchAction keeps the browser from scrolling the page while the thumb is dragged with a finger.
      style={[{ width: KNOB, height, alignItems: 'center' }, web ? ({ touchAction: 'none', cursor: 'pointer' } as any) : null]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: TOUCH / 2, bottom: TOUCH / 2, width: TRACK, borderRadius: TRACK, backgroundColor: trackColor }} />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: thumbTop + TOUCH / 2, bottom: TOUCH / 2, width: TRACK, borderRadius: TRACK, backgroundColor: fillColor }}
      />
      <View pointerEvents="none" style={{ position: 'absolute', top: thumbTop, width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: thumbColor, // the page colour, so the track doesn't show through the ring
            borderWidth: 3,
            borderColor: fillColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 20, color: valueColor }}>{shown}</Text>
        </View>
      </View>
    </View>
  );
}
