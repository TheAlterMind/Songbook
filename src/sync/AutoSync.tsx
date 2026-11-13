import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onLocalEdit } from '../utils/localEdits';
import { isSignedIn } from './googleAuth';
import { syncNow } from './syncService';

const EDIT_DELAY_MS = 5000; // Wait for a burst of edits to settle before syncing.
const RESUME_MIN_GAP_MS = 60 * 1000; // Coming back to the app syncs at most once a minute.

/**
 * Keeps the Drive copy up to date without a tap: once when the app opens, shortly after each edit, and when the
 * app comes back to the foreground. It only runs when you are already signed in and never opens a sign-in screen.
 * Failures (offline, signed out) are ignored; the cloud button still shows errors when you sync by hand.
 */
export default function AutoSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRun = 0;
    let stopped = false;

    const run = async () => {
      lastRun = Date.now();
      try {
        if (stopped || !(await isSignedIn())) return;
        await syncNow(false);
      } catch {
        // Quiet on purpose.
      }
    };

    run();

    const offEdit = onLocalEdit(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, EDIT_DELAY_MS);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastRun > RESUME_MIN_GAP_MS) run();
    });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      offEdit();
      appState.remove();
    };
  }, []);

  return null;
}
