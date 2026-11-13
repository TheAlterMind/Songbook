import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { nativeAudio } from './nativeAudio';
import { makeClickWav } from './clickWav';

/**
 * The metronome's sound and beat clock. `onBeat(n)` is called as each beat sounds, n counting from 0 within the bar.
 * On the web and in the desktop app the clicks are scheduled ahead on the audio clock (Web Audio). On a phone a
 * click track is generated as a WAV file and looped by expo-audio, so the spacing does not depend on JS timers;
 * the beat counter shown on screen follows its own timer started alongside.
 */
export function useClickEngine(onBeat: (beat: number) => void) {
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  // The hook is called only when the module exists, which is fixed for the life of the app.
  const player = nativeAudio ? nativeAudio.useAudioPlayer(null) : null;

  const s = useRef({
    running: false,
    bpm: 100,
    beats: 4,
    // web
    ctx: null as AudioContext | null,
    scheduler: null as ReturnType<typeof setInterval> | null,
    nextTime: 0,
    count: 0,
    // phone
    timer: null as ReturnType<typeof setTimeout> | null,
    startedAt: 0,
    file: 0,
    token: 0,
  }).current;

  // ---- Web ----

  const click = (ctx: AudioContext, when: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1700 : 1050;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.65, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  };

  const startWeb = () => {
    const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    s.ctx = ctx;
    s.nextTime = ctx.currentTime + 0.08;
    s.count = 0;
    const schedule = () => {
      while (s.nextTime < ctx.currentTime + 0.12) {
        const beat = s.count % s.beats;
        click(ctx, s.nextTime, beat === 0);
        setTimeout(() => onBeatRef.current(beat), Math.max(0, (s.nextTime - ctx.currentTime) * 1000));
        s.nextTime += 60 / s.bpm;
        s.count++;
      }
    };
    schedule();
    s.scheduler = setInterval(schedule, 25);
  };

  const stopWeb = () => {
    if (s.scheduler) clearInterval(s.scheduler);
    s.scheduler = null;
    s.ctx?.close().catch(() => {});
    s.ctx = null;
  };

  // ---- Phone ----

  const loadTrack = () => {
    if (!player) return;
    // Two file names, used in turn, so a changed tempo never reloads the file that is still playing.
    s.file = 1 - s.file;
    const file = new File(Paths.cache, `songbook-click-${s.file}.wav`);
    file.create({ overwrite: true });
    file.write(makeClickWav(s.bpm, s.beats));
    player.replace({ uri: file.uri });
    player.loop = true;
    player.volume = 1;
  };

  const startNative = () => {
    if (!player) return;
    if (s.timer) clearTimeout(s.timer);
    loadTrack();
    player.play();
    s.startedAt = Date.now();
    s.count = 0;
    const tick = () => {
      onBeatRef.current(s.count % s.beats);
      s.count++;
      s.timer = setTimeout(tick, Math.max(0, s.startedAt + (s.count * 60000) / s.bpm - Date.now()));
    };
    tick();
  };

  const stopNative = () => {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    try {
      player?.pause();
      player?.seekTo(0);
    } catch {
      // The player is already gone.
    }
  };

  // ---- Shared ----

  const start = useCallback((bpm: number, beats: number) => {
    if (s.running) return;
    s.running = true;
    s.bpm = bpm;
    s.beats = beats;
    if (Platform.OS === 'web') startWeb();
    else startNative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const stop = useCallback(() => {
    if (!s.running) return;
    s.running = false;
    if (Platform.OS === 'web') stopWeb();
    else stopNative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  /** Changes the tempo or beats per bar while running. On a phone the click track is rebuilt and restarts at beat 1. */
  const update = useCallback((bpm: number, beats: number) => {
    if (!s.running) return;
    const changed = bpm !== s.bpm || beats !== s.beats;
    s.bpm = bpm;
    s.beats = beats;
    if (changed && Platform.OS !== 'web') startNative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(
    () => () => {
      if (!s.running) return;
      s.running = false;
      if (Platform.OS === 'web') stopWeb();
      else stopNative();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { start, stop, update, available: Platform.OS === 'web' || !!nativeAudio };
}
