import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Animated, Platform } from 'react-native';
import { Text } from '../components/Typography';
import { useTheme } from '../theme/ThemeContext';
import { TYPE } from '../theme/tokens';
import { useClickEngine } from './useClickEngine';
import VerticalSlider from './VerticalSlider';

const MIN_BPM = 40;
const MAX_BPM = 200;
// 2/4 up to 13/4, which takes in the odd signatures too: 5/4, 7/4, 9/4, 11/4 and 13/4.
const MIN_BEATS = 2;
const MAX_BEATS = 13;

const SIDE = 68; // width of the two slider columns
const LABEL = 28; // height of the BPM and Beats labels above the sliders
const GAP = 8; // between a label and its slider
const MIN_SLIDER = 160;

const clampBpm = (n: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n)));

/**
 * The metronome fills the space it is given: the sliders run from the top of that space to the bottom of it, and
 * the Tap tempo circle sits exactly halfway down, so the screen reads the same on a short phone and a tall one.
 */
export default function Metronome() {
  const { colors, radius } = useTheme();
  const [bpm, setBpm] = useState(100);
  const [beats, setBeats] = useState(4);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1); // the beat that last sounded, -1 before the first
  const [space, setSpace] = useState(0); // height available, measured
  const [holding, setHolding] = useState<null | 'bpm' | 'beats'>(null); // which slider head is being held
  const taps = useRef<number[]>([]);

  const engine = useClickEngine((n) => setBeat(n));

  // A quick swell on each beat, bigger on the 1.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!running || beat < 0) return;
    pulse.stopAnimation();
    pulse.setValue(1);
    Animated.sequence([
      Animated.timing(pulse, { toValue: beat === 0 ? 1.12 : 1.06, duration: 80, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [beat, running, pulse]);

  const toggle = () => {
    if (running) {
      engine.stop();
      setRunning(false);
      setBeat(-1);
    } else {
      engine.start(bpm, beats);
      setRunning(true);
    }
  };

  // A changed tempo or bar length reaches the clicks. On a phone that rebuilds the click track, so wait for the
  // value to settle instead of rebuilding for every step of a drag.
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => engine.update(bpm, beats), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, beats, running]);

  const tapTempo = () => {
    const now = Date.now();
    const list = taps.current;
    if (list.length && now - list[list.length - 1] > 2500) list.length = 0; // a pause starts a new count
    list.push(now);
    if (list.length > 6) list.shift();
    if (list.length >= 2) {
      const gaps = list.slice(1).map((t, i) => t - list[i]);
      setBpm(clampBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)));
    }
  };

  if (!engine.available) {
    return (
      <Text style={{ fontSize: TYPE.body, color: colors.neutral500, lineHeight: TYPE.body * 1.5 }}>
        The metronome needs a newer build of the app. Install the latest build on this device.
      </Text>
    );
  }

  const sliderHeight = Math.max(MIN_SLIDER, space - LABEL - GAP);
  // Sizes that give way a little on a short screen so nothing overlaps.
  const tapSize = Math.max(104, Math.min(156, Math.floor(space * 0.3)));
  const bpmSize = space < 470 ? 54 : 68;

  const sliderLabel = (text: string) => (
    <View style={{ height: LABEL, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: TYPE.body, fontWeight: '500', color: colors.text }}>{text}</Text>
    </View>
  );

  const slider = (props: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; held: 'bpm' | 'beats' }) => (
    <VerticalSlider
      value={props.value}
      min={props.min}
      max={props.max}
      onChange={props.onChange}
      label={props.label}
      onHold={(on) => setHolding(on ? props.held : null)}
      height={sliderHeight}
      trackColor={colors.surface}
      fillColor={colors.accent}
      thumbColor={colors.bg}
      valueColor={colors.text}
    />
  );

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setSpace(e.nativeEvent.layout.height)}>
      {space > 0 && (
        <View style={{ height: space, flexDirection: 'row', alignItems: 'stretch', gap: 12 }}>
          {/* Tempo. */}
          <View style={{ width: SIDE, alignItems: 'center', gap: GAP }}>
            {sliderLabel('BPM')}
            {slider({ value: bpm, min: MIN_BPM, max: MAX_BPM, onChange: setBpm, label: 'Tempo, beats per minute', held: 'bpm' })}
          </View>

          {/* From the top: the value being adjusted, tap tempo (exactly halfway down), and start. */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 24 }}>
              {/* Only visible while a slider head is held, and shows the value of the slider being driven. */}
              <Text style={{ fontSize: bpmSize, fontWeight: '500', color: colors.text, lineHeight: bpmSize + 8, opacity: holding ? 1 : 0 }}>
                {holding === 'beats' ? beats : bpm}
              </Text>
            </View>

            {/* The ring pulses on every beat: accent on the 1, grey on the rest. Idle it stays accent. */}
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <TouchableOpacity
                onPress={tapTempo}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Tap tempo"
                style={{
                  width: tapSize,
                  height: tapSize,
                  borderRadius: tapSize / 2,
                  borderWidth: 3,
                  borderColor: running && beat > 0 ? colors.neutral500 : colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: TYPE.body, color: colors.text }}>Tap</Text>
                <Text style={{ fontSize: TYPE.body, color: colors.text }}>tempo</Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 14, paddingBottom: 48 }}>
              <TouchableOpacity
                onPress={toggle}
                // As wide as the Tap tempo circle above it.
                style={{ width: tapSize, height: 56, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: TYPE.body, fontWeight: '500', color: colors.accent100 }}>{running ? 'Stop' : 'Start'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Beats per bar. */}
          <View style={{ width: SIDE, alignItems: 'center', gap: GAP }}>
            {sliderLabel('Beats')}
            {slider({ value: beats, min: MIN_BEATS, max: MAX_BEATS, onChange: setBeats, label: 'Beats per bar', held: 'beats' })}
          </View>
        </View>
      )}
    </View>
  );
}
