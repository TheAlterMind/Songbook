import { Alert, Platform } from 'react-native';

/** A simple message with an OK button. React Native Web's Alert does nothing, so web uses the browser's. */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/** The message to show for a failed save or load. */
export function errorText(e: unknown): string {
  return (e as any)?.message || 'Something went wrong.';
}
