import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Animated, LayoutChangeEvent } from 'react-native';
import { Text } from '../components/Typography';
import { useTheme } from '../theme/ThemeContext';
import { TYPE } from '../theme/tokens';
import { detectPitch, GUITAR_STRINGS, nearestGuitarString, noteFromFrequency } from './pitch';
import { useMicrophone } from './useMicrophone';

type Mode = 'chromatic' | 'guitar';

type Reading = { name: string; octave: number; cents: number; frequency: number; stringLabel?: string };

const WINDOW = 4096; // samples looked at each time, before halving the rate
const HOP = 2048; // new samples needed before looking again (about 20 times a second)
const IN_TUNE_CENTS = 5;
const SILENCE_MS = 700; // without a clear note this long, the reading goes away

export default function Tuner({ active }: { active: boolean }) {
  const { colors, radius } = useTheme();
  const [mode, setMode] = useState<Mode>('chromatic');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [reading, setReading] = useState<Reading | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  const needle = useRef(new Animated.Value(0)).current;

  const ring = useRef(new Float32Array(WINDOW));
  const sinceLook = useRef(0);
  const recent = useRef<number[]>([]);
  const lastNote = useRef(0);

  const analyse = (samples: Float32Array, sampleRate: number) => {
    // Keep the latest WINDOW samples.
    const r = ring.current;
    if (samples.length >= WINDOW) r.set(samples.subarray(samples.length - WINDOW));
    else {
      r.copyWithin(0, samples.length);
      r.set(samples, WINDOW - samples.length);
    }
    sinceLook.current += samples.length;
    if (sinceLook.current < HOP) return;
    sinceLook.current = 0;

    // Halving the rate is plenty for notes up to a few kHz and makes the search four times cheaper.
    const half = new Float32Array(WINDOW / 2);
    for (let i = 0; i < half.length; i++) half[i] = (r[2 * i] + r[2 * i + 1]) / 2;
    const found = detectPitch(half, sampleRate / 2, 60, 1200);

    const now = Date.now();
    if (!found || found.clarity < 0.8) {
      if (now - lastNote.current > SILENCE_MS) {
        recent.current = [];
        setReading(null);
      }
      return;
    }
    lastNote.current = now;

    // The middle of the last three readings, so a single stray one does not make the needle jump.
    recent.current.push(found.frequency);
    if (recent.current.length > 3) recent.current.shift();
    const frequency = [...recent.current].sort((a, b) => a - b)[Math.floor(recent.current.length / 2)];

    if (modeRef.current === 'guitar') {
      const { string, cents } = nearestGuitarString(frequency);
      setReading({ name: string.name, octave: string.octave, cents, frequency, stringLabel: string.label });
    } else {
      const note = noteFromFrequency(frequency);
      setReading({ name: note.name, octave: note.octave, cents: note.cents, frequency });
    }
  };

  const mic = useMicrophone(analyse);

  // Stop listening when the user leaves the tuner or the Tools tab.
  const { stop } = mic;
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  useEffect(() => {
    if (mic.status !== 'listening') {
      setReading(null);
      recent.current = [];
    }
  }, [mic.status]);

  // The needle glides to the new position.
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  useEffect(() => {
    Animated.timing(needle, { toValue: cents, duration: 120, useNativeDriver: false }).start();
  }, [cents, needle]);

  const listening = mic.status === 'listening';
  const inTune = !!reading && Math.abs(reading.cents) <= IN_TUNE_CENTS;
  const left = needle.interpolate({ inputRange: [-50, 50], outputRange: [0, Math.max(0, barWidth - 4)] });

  const hint = reading
    ? inTune
      ? 'In tune'
      : reading.cents < 0
        ? 'Flat: tune up'
        : 'Sharp: tune down'
    : listening
      ? 'Play a note'
      : mic.status === 'starting'
        ? 'Starting…'
        : 'Tap Start, then play a note';

  return (
    <View style={{ gap: 22 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['chromatic', 'guitar'] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            style={{
              flex: 1,
              height: 44,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: mode === m ? colors.accent : colors.surface,
            }}
          >
            <Text style={{ fontSize: TYPE.body, color: mode === m ? colors.accent100 : colors.text }}>
              {m === 'chromatic' ? 'Chromatic' : 'Guitar'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ alignItems: 'center', minHeight: 130, justifyContent: 'center' }}>
        <Text style={{ fontSize: 88, fontWeight: '500', lineHeight: 96, color: inTune ? colors.accent : colors.text }}>
          {reading ? reading.name : '–'}
          {reading && <Text style={{ fontSize: 30, color: colors.neutral500 }}>{reading.octave}</Text>}
        </Text>
        <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>
          {reading ? `${reading.frequency.toFixed(1)} Hz · ${reading.cents > 0 ? '+' : ''}${Math.round(reading.cents)} cents` : ' '}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <View
          onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
          style={{ height: 44, justifyContent: 'center' }}
        >
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface }} />
          {/* The centre mark, and the zone that counts as in tune. */}
          <View
            style={{
              position: 'absolute',
              left: '50%',
              marginLeft: -((barWidth * IN_TUNE_CENTS) / 100),
              width: (barWidth * IN_TUNE_CENTS * 2) / 100,
              height: 6,
              backgroundColor: colors.accent800,
              opacity: 0.9,
            }}
          />
          <View style={{ position: 'absolute', left: '50%', marginLeft: -1, width: 2, height: 22, backgroundColor: colors.neutral500 }} />
          <Animated.View
            style={{
              position: 'absolute',
              left,
              width: 4,
              height: 34,
              borderRadius: 2,
              backgroundColor: inTune ? colors.accent : colors.text,
              opacity: reading ? 1 : 0.25,
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>♭ flat</Text>
          <Text style={{ fontSize: TYPE.small, color: inTune ? colors.accent : colors.neutral500 }}>{hint}</Text>
          <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>sharp ♯</Text>
        </View>
      </View>

      {mode === 'guitar' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {GUITAR_STRINGS.map((s) => {
            const on = reading?.stringLabel === s.label;
            return (
              <View
                key={s.label}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? colors.accent : colors.surface,
                }}
              >
                <Text style={{ fontSize: TYPE.body, fontWeight: '500', color: on ? colors.accent100 : colors.text }}>{s.name}</Text>
                <Text style={{ fontSize: TYPE.tiny, color: on ? colors.accent100 : colors.neutral500 }}>string {s.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {!!mic.message && mic.status !== 'listening' && (
        <Text style={{ fontSize: TYPE.small, color: colors.neutral500, lineHeight: TYPE.small * 1.5 }}>{mic.message}</Text>
      )}

      <TouchableOpacity
        onPress={listening ? mic.stop : mic.start}
        disabled={mic.status === 'starting'}
        style={{ height: 56, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: TYPE.body, fontWeight: '500', color: colors.accent100 }}>{listening ? 'Stop' : 'Start'}</Text>
      </TouchableOpacity>
    </View>
  );
}
