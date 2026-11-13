// Gives the web app a few functions for Google sign-in through the normal browser (see main.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('songbookDesktop', {
  /** Resolves { accessToken, expiresIn } when signed in, or null when the user cancelled or it timed out. */
  signIn: (clientId, scope) => ipcRenderer.invoke('songbook:sign-in', clientId, scope),
  /** True when a saved sign-in can produce new access tokens without asking. */
  hasRefresh: () => ipcRenderer.invoke('songbook:has-refresh'),
  /** A new { accessToken, expiresIn } from the saved sign-in, or null. */
  refresh: () => ipcRenderer.invoke('songbook:refresh'),
  /** Forgets the saved sign-in and asks Google to revoke it. */
  signOut: () => ipcRenderer.invoke('songbook:sign-out'),
});
