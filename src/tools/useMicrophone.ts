import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { nativeAudio } from './nativeAudio';

export type MicStatus = 'idle' | 'starting' | 'listening' | 'denied' | 'unavailable' | 'error';

type Handlers = { stop: () => void };

/**
 * Microphone samples for the tuner. `onSamples` is called with each chunk of mono audio (-1..1) and its sample
 * rate. On a phone the samples come from expo-audio's stream; on the web and in the desktop app from Web Audio.
 * `start` asks for permission the first time.
 */
export function useMicrophone(onSamples: (samples: Float32Array, sampleRate: number) => void) {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [message, setMessage] = useState('');
  const onSamplesRef = useRef(onSamples);
  onSamplesRef.current = onSamples;
  const web = useRef<Handlers | null>(null);

  // The hook is called only when the module exists, which is fixed for the life of the app.
  const nativeStream = nativeAudio
    ? nativeAudio.useAudioStream({
        sampleRate: 44100,
        channels: 1,
        encoding: 'float32',
        onBuffer: (buffer) => onSamplesRef.current(new Float32Array(buffer.data), buffer.sampleRate),
      })
    : null;

  const stop = useCallback(() => {
    web.current?.stop();
    web.current = null;
    try {
      nativeStream?.stream.stop();
    } catch {
      // Already stopped.
    }
    setStatus((s) => (s === 'listening' || s === 'starting' ? 'idle' : s));
  }, [nativeStream?.stream]);

  const startWeb = async () => {
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      setStatus('unavailable');
      setMessage('This browser cannot use the microphone here.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e: any) {
      const refused = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      setStatus(refused ? 'denied' : 'error');
      setMessage(refused ? 'Microphone access is blocked. Allow it for this site or app and try again.' : e?.message || 'Could not open the microphone.');
      return;
    }
    const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but works everywhere this app runs and needs no extra file for a worklet.
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = (ev) => {
      onSamplesRef.current(new Float32Array(ev.inputBuffer.getChannelData(0)), ctx.sampleRate);
    };
    // It only runs while connected to the output, so route it through a muted gain.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    web.current = {
      stop: () => {
        processor.onaudioprocess = null;
        try {
          source.disconnect();
          processor.disconnect();
          mute.disconnect();
        } catch {
          // Already disconnected.
        }
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      },
    };
    setStatus('listening');
  };

  const startNative = async () => {
    if (!nativeAudio || !nativeStream) {
      setStatus('unavailable');
      setMessage('The tuner needs a newer build of the app. Install the latest build on this device.');
      return;
    }
    try {
      const permission = await nativeAudio.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatus('denied');
        setMessage(
          permission.canAskAgain
            ? 'The tuner needs the microphone. Tap Start and allow access.'
            : 'Microphone access is off. Turn it on for Songbook in the phone\'s app settings.'
        );
        return;
      }
      await nativeAudio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
      await nativeStream.stream.start();
      setStatus('listening');
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.message || 'Could not start the microphone.');
    }
  };

  const start = useCallback(async () => {
    setMessage('');
    setStatus('starting');
    if (Platform.OS === 'web') await startWeb();
    else await startNative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeStream?.stream]);

  // Let go of the microphone when the screen goes away.
  useEffect(
    () => () => {
      web.current?.stop();
      web.current = null;
      try {
        nativeStream?.stream.stop();
      } catch {
        // Already stopped.
      }
      nativeAudio?.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { status, message, start, stop };
}
