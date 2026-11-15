import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Animated, LayoutChangeEvent, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '../components/Typography';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON } from '../theme/tokens';
import { ChevronRightIcon } from '../components/Icons';
import { detectPitch, nearestGuitarString, TUNINGS } from './pitch';
import { useMicrophone } from './useMicrophone';

type Reading = { name: string; octave: number; cents: number; frequency: number; stringLabel?: string };

const WINDOW = 4096; // samples looked at each time, before halving the rate
const HOP = 2048; // new samples needed before looking again (about 20 times a second)
const IN_TUNE_CENTS = 5;
const TUNING_KEY = 'songbook.tuner.tuning';
const SILENCE_MS = 1200; // without a clear note this long, the reading goes away

export default function Tuner({ active }: { active: boolean }) {
  const { colors, radius } = useTheme();
  // The guitar tuning in use, chosen from the list under the Tuning button.
  const [tuningId, setTuningId] = useState(TUNINGS[0].id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const tuning = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0];
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  useEffect(() => {
    AsyncStorage.getItem(TUNING_KEY)
      .then((id) => {
        if (id && TUNINGS.some((t) => t.id === id)) setTuningId(id);
      })
      .catch(() => {});
  }, []);
  const chooseTuning = (id: string) => {
    setTuningId(id);
    setPickerOpen(false);
    AsyncStorage.setItem(TUNING_KEY, id).catch(() => {});
  };
  // The Back key closes the list before it leaves the tuner.
  useEffect(() => {
    if (!pickerOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPickerOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [pickerOpen]);
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
    if (!found || found.clarity < 0.7) {
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

    const { string, cents } = nearestGuitarString(frequency, tuningRef.current.strings);
    setReading({ name: string.name, octave: string.octave, cents, frequency, stringLabel: string.label });
  };

  const mic = useMicrophone(analyse);

  // Listening starts by itself when the tuner is on screen and stops when the user leaves it or the Tools tab.
  // If the microphone is refused or fails, it does not retry on its own: the button below does.
  const { stop, start } = mic;
  useEffect(() => {
    if (!active) stop();
    else if (mic.status === 'idle') start();
  }, [active, mic.status, stop, start]);

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
        : 'Microphone is off';

  return (
    <View style={{ gap: 22 }}>
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity
          onPress={() => setPickerOpen((o) => !o)}
          accessibilityLabel={`Tuning: ${tuning.label}. Choose another`}
          style={{
            flex: 1,
            height: 44,
            borderRadius: radius.md,
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
          }}
        >
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: TYPE.body, color: colors.text }}>{tuning.label.split(' (')[0]}</Text>
          <View style={{ transform: [{ rotate: pickerOpen ? '-90deg' : '90deg' }] }}>
            <ChevronRightIcon color={colors.neutral500} size={ICON.small} />
          </View>
        </TouchableOpacity>
      </View>

      {pickerOpen && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 6 }}>
          {TUNINGS.map((t) => {
            const on = t.id === tuning.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => chooseTuning(t.id)}
                style={{ height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ fontSize: TYPE.body, color: colors.text }}>{t.label}</Text>
                {on && <Text style={{ fontSize: TYPE.body, color: colors.accent }}>{'✓'}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tuning.strings.map((s) => {
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
        <Text style={{ fontSize: TYPE.tiny, color: colors.neutral500, textAlign: 'center' }}>{tuning.label}</Text>
      </View>

      {!!mic.message && mic.status !== 'listening' && (
        <Text style={{ fontSize: TYPE.small, color: colors.neutral500, lineHeight: TYPE.small * 1.5 }}>{mic.message}</Text>
      )}

      {(mic.status === 'denied' || mic.status === 'error' || mic.status === 'unavailable') && (
        <TouchableOpacity
          onPress={mic.start}
          style={{ height: 56, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: TYPE.body, fontWeight: '500', color: colors.accent100 }}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
