// Gives the web app one function: signing in to Google through the normal browser (see main.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('songbookDesktop', {
  /** Resolves { accessToken, expiresIn } when signed in, or null when the user cancelled or it timed out. */
  signIn: (clientId, scope) => ipcRenderer.invoke('songbook:sign-in', clientId, scope),
});
