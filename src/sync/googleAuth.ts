import type { DiscoveryDocument } from 'expo-auth-session';
import { Platform } from 'react-native';
import { DRIVE_SCOPE } from './driveClient';

// These native modules are loaded only when sync is used, so a build made before they were added still starts.
const AuthSession = (): typeof import('expo-auth-session') => require('expo-auth-session');
const SecureStore = (): typeof import('expo-secure-store') => require('expo-secure-store');

// Lets the sign-in popup close itself again on web.
if (Platform.OS === 'web') (require('expo-web-browser') as typeof import('expo-web-browser')).maybeCompleteAuthSession();

// Client ids come from .env.local (see SYNC_SETUP.md). They are not secrets, but they are yours, so they stay out of git.
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const discovery: DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const REFRESH_KEY = 'songbook.google.refreshToken';
const WEB_TOKEN_KEY = 'songbook.google.webToken';
const MARGIN_MS = 60 * 1000;

export class NotSignedInError extends Error {
  constructor() {
    super('Not signed in to Google.');
    this.name = 'NotSignedInError';
  }
}

let cached: { token: string; expiresAt: number } | null = null;

/** Whether this build has the Google client id it needs for this platform. */
export function isSyncConfigured(): boolean {
  if (Platform.OS === 'android') return !!ANDROID_CLIENT_ID;
  if (Platform.OS === 'web') return !!WEB_CLIENT_ID;
  return false;
}

function webStore(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function readWebToken(): { token: string; expiresAt: number } | null {
  try {
    const raw = webStore()?.getItem(WEB_TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** True when there is a sign-in that can still produce an access token without asking the user. */
export async function isSignedIn(): Promise<boolean> {
  if (!isSyncConfigured()) return false;
  if (cached && cached.expiresAt - MARGIN_MS > Date.now()) return true;
  if (Platform.OS === 'android') {
    try {
      return !!(await SecureStore().getItemAsync(REFRESH_KEY));
    } catch {
      return false; // A build without the secure storage module: not signed in.
    }
  }
  const web = readWebToken();
  if (web && web.expiresAt - MARGIN_MS > Date.now()) return true;
  try {
    return !!(await desktopBridge()?.hasRefresh?.());
  } catch {
    return false;
  }
}

async function signInAndroid(): Promise<string> {
  const clientId = ANDROID_CLIENT_ID as string;
  // Google's rule for Android clients: the redirect scheme is the client id, reversed.
  const redirectUri = `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}:/oauthredirect`;
  const request = new (AuthSession().AuthRequest)({ clientId, scopes: [DRIVE_SCOPE], redirectUri, usePKCE: true });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') throw new NotSignedInError();
  const tokens = await AuthSession().exchangeCodeAsync(
    { clientId, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier as string } },
    discovery
  );
  if (tokens.refreshToken) await SecureStore().setItemAsync(REFRESH_KEY, tokens.refreshToken);
  cached = { token: tokens.accessToken, expiresAt: Date.now() + (tokens.expiresIn ?? 3000) * 1000 };
  return tokens.accessToken;
}

/** Present when the web app runs inside the Songbook desktop window (desktop/preload.js). */
type DesktopToken = { accessToken: string; expiresIn: number };
type DesktopBridge = {
  signIn(clientId: string, scope: string): Promise<DesktopToken | null>;
  // Present once the desktop shell can keep a refresh token; older shells only have signIn.
  hasRefresh?(): Promise<boolean>;
  refresh?(): Promise<DesktopToken | null>;
  signOut?(): Promise<void>;
};

function desktopBridge(): DesktopBridge | null {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? ((window as any).songbookDesktop ?? null) : null;
}

async function signInWeb(): Promise<string> {
  const clientId = WEB_CLIENT_ID as string;
  // In a plain browser the token flow needs no client secret; the token lasts about an hour, then the user signs in
  // again. The desktop window can do better when a Desktop client is configured (desktop/main.js).
  let token: string;
  let expiresInSeconds: number;

  const desktop = desktopBridge();
  if (desktop) {
    // Google refuses sign-in inside an embedded window, so the desktop shell uses the normal browser.
    const result = await desktop.signIn(clientId, DRIVE_SCOPE);
    if (!result) throw new NotSignedInError();
    token = result.accessToken;
    expiresInSeconds = result.expiresIn;
  } else {
    const request = new (AuthSession().AuthRequest)({
      clientId,
      scopes: [DRIVE_SCOPE],
      redirectUri: AuthSession().makeRedirectUri(),
      responseType: AuthSession().ResponseType.Token,
      usePKCE: false,
    });
    const result = await request.promptAsync(discovery);
    if (result.type !== 'success' || !result.params.access_token) throw new NotSignedInError();
    token = result.params.access_token;
    expiresInSeconds = Number(result.params.expires_in || 3000);
  }

  cached = { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
  try {
    webStore()?.setItem(WEB_TOKEN_KEY, JSON.stringify(cached));
  } catch {
    // Storage blocked: the token still works until the page closes.
  }
  return token;
}

/** Opens Google's sign-in and returns an access token. */
export async function signIn(): Promise<string> {
  if (!isSyncConfigured()) throw new Error('Google sign-in is not set up in this build. See SYNC_SETUP.md.');
  return Platform.OS === 'android' ? signInAndroid() : signInWeb();
}

/**
 * An access token for Drive. Uses the saved sign-in when it still works, and only opens the Google
 * sign-in screen when `interactive` is true. Otherwise it throws NotSignedInError.
 */
export async function getAccessToken(interactive: boolean): Promise<string> {
  if (cached && cached.expiresAt - MARGIN_MS > Date.now()) return cached.token;

  if (Platform.OS === 'android' && ANDROID_CLIENT_ID) {
    const refreshToken = await SecureStore().getItemAsync(REFRESH_KEY);
    if (refreshToken) {
      try {
        const tokens = await AuthSession().refreshAsync({ clientId: ANDROID_CLIENT_ID, refreshToken }, discovery);
        cached = { token: tokens.accessToken, expiresAt: Date.now() + (tokens.expiresIn ?? 3000) * 1000 };
        return tokens.accessToken;
      } catch {
        // Revoked or expired: forget it and fall through to a new sign-in.
        await SecureStore().deleteItemAsync(REFRESH_KEY);
      }
    }
  } else {
    const web = readWebToken();
    if (web && web.expiresAt - MARGIN_MS > Date.now()) {
      cached = web;
      return web.token;
    }
    // The desktop window can trade its saved refresh token for a new access token without asking.
    try {
      const fresh = await desktopBridge()?.refresh?.();
      if (fresh) {
        cached = { token: fresh.accessToken, expiresAt: Date.now() + fresh.expiresIn * 1000 };
        return fresh.accessToken;
      }
    } catch {
      // Fall through to a normal sign-in.
    }
  }

  if (!interactive) throw new NotSignedInError();
  return signIn();
}

/** Drops the in-memory token (after Google rejected it) so the next call gets a fresh one. */
export function dropCachedToken(): void {
  cached = null;
  try {
    webStore()?.removeItem(WEB_TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Forgets the sign-in on this device and asks Google to revoke it. */
export async function signOut(): Promise<void> {
  const token = cached?.token;
  cached = null;
  try {
    webStore()?.removeItem(WEB_TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
  if (Platform.OS === 'android') await SecureStore().deleteItemAsync(REFRESH_KEY);
  try {
    await desktopBridge()?.signOut?.();
  } catch {
    // The desktop copy is best effort too.
  }
  if (token) {
    try {
      await AuthSession().revokeAsync({ token }, discovery);
    } catch {
      // Revoking is best effort; the local sign-in is already gone.
    }
  }
}
