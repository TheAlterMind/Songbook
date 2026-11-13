import { Alert, Platform } from 'react-native';

/** A simple message with an OK button. React Native Web's Alert does nothing, so web uses the browser's. */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message, [{ text: 'OK' }], { cancelable: true });
}

/** The message to show for a failed save or load. */
export function errorText(e: unknown): string {
  return (e as any)?.message || 'Something went wrong.';
}

/** Asks for a go-ahead before something that can't be undone. The browser's confirm on web, an alert on a phone. */
export function confirmThen(title: string, message: string, confirmText: string, run: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) run();
    return;
  }
  // cancelable: the Android Back button and a tap outside close the dialog without doing anything.
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmText, style: 'destructive', onPress: run },
    ],
    { cancelable: true }
  );
}
