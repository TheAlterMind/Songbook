// Songbook desktop shell: an Electron window around the Expo web export (dist/).
//
// The export is served from http://localhost:PORT instead of file:// because the web database (SQLite in the
// browser's private file system) needs a real origin and cross-origin isolation headers, and because Google's
// sign-in needs a fixed address to come back to. The same server also receives the sign-in result.
//
// Google refuses sign-in inside embedded windows, so signing in opens the normal browser. Google sends the browser
// back to /oauth-callback on this server, whose page hands the token to the app. No client secret is involved.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 8765;
const ORIGIN = `http://localhost:${PORT}`;
const REDIRECT_URI = `${ORIGIN}/oauth-callback`;
const ROOT = path.join(__dirname, '..', 'dist');
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// ---- Sign-in ----

/** The sign-in that is waiting for Google's answer: { state, resolve, timer } or null. */
let pending = null;

function finishSignIn(result) {
  if (!pending) return;
  clearTimeout(pending.timer);
  const { resolve } = pending;
  pending = null;
  resolve(result);
}

ipcMain.handle('songbook:sign-in', (_event, clientId, scope) => {
  if (typeof clientId !== 'string' || !/^[\w.-]+$/.test(clientId)) throw new Error('Bad Google client id.');
  if (typeof scope !== 'string' || !/^https:\/\/www\.googleapis\.com\/auth\/[\w.]+$/.test(scope)) throw new Error('Bad scope.');

  finishSignIn(null); // A newer sign-in replaces an older one that was never finished.
  const state = crypto.randomBytes(24).toString('hex');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope,
    state,
    include_granted_scopes: 'true',
  }).toString();

  return new Promise((resolve) => {
    pending = { state, resolve, timer: setTimeout(() => finishSignIn(null), SIGN_IN_TIMEOUT_MS) };
    shell.openExternal(url.toString()).catch(() => finishSignIn(null));
  });
});

// The page Google redirects the browser to. The token arrives in the URL fragment, which only scripts can read,
// so the page posts it back to this server.
const CALLBACK_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Songbook</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui,sans-serif;background:#0d0c18;color:#eee;display:grid;place-items:center;height:100vh;margin:0;text-align:center}</style>
</head><body><p id="m">Finishing sign-in…</p><script>
(function () {
  var p = new URLSearchParams(location.hash.slice(1));
  var m = document.getElementById('m');
  fetch('/oauth-token', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: p.get('state'), accessToken: p.get('access_token'), expiresIn: Number(p.get('expires_in')) || 0, error: p.get('error') }) })
    .then(function (r) { m.textContent = r.ok && !p.get('error') ? 'Signed in. You can close this tab and return to Songbook.' : 'Sign-in did not finish. Return to Songbook and try again.'; })
    .catch(function () { m.textContent = 'Could not reach Songbook. Is it still open?'; });
  history.replaceState(null, '', location.pathname);
})();
</script></body></html>`;

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---- Local server ----

function send(res, status, headers, body) {
  res.writeHead(status, {
    // SharedArrayBuffer (used by the web SQLite) needs cross-origin isolation.
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

async function handle(req, res) {
  // Only answer requests addressed to this server, which blocks DNS-rebinding from other sites.
  if (!ALLOWED_HOSTS.has(req.headers.host || '')) return send(res, 403, {}, 'Forbidden');

  const pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname);

  if (pathname === '/oauth-callback' && req.method === 'GET') {
    return send(res, 200, { 'Content-Type': MIME['.html'] }, CALLBACK_PAGE);
  }

  if (pathname === '/oauth-token' && req.method === 'POST') {
    if (req.headers.origin !== ORIGIN) return send(res, 403, {}, 'Forbidden');
    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, {}, 'Bad request');
    }
    if (!pending || typeof data.state !== 'string' || data.state !== pending.state) return send(res, 400, {}, 'Unknown sign-in');
    const ok = !data.error && typeof data.accessToken === 'string' && data.accessToken && data.expiresIn > 0;
    finishSignIn(ok ? { accessToken: data.accessToken, expiresIn: data.expiresIn } : null);
    if (ok && mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    return send(res, ok ? 200 : 400, {}, ok ? 'OK' : 'Sign-in failed');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, 'Method not allowed');

  // Static files from the export; unknown paths without an extension fall back to the app (client-side routes).
  let file = path.normalize(path.join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, {}, 'Forbidden');
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    if (path.extname(pathname)) return send(res, 404, {}, 'Not found');
    file = path.join(ROOT, 'index.html');
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, {}, 'Not found');
    send(res, 200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' }, req.method === 'HEAD' ? undefined : buf);
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch(() => send(res, 500, {}, 'Server error'));
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// ---- Window ----

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 420,
    minHeight: 520,
    backgroundColor: '#0d0c18',
    title: 'Songbook',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // Links to other sites open in the normal browser; the app window never leaves its own address.
  const openOutside = (url) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN + '/')) {
      event.preventDefault();
      openOutside(url);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(ORIGIN + '/');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
      dialog.showErrorBox('Songbook', 'The web build is missing. Run "npm run desktop" to build it first.');
      return app.quit();
    }
    try {
      await startServer();
    } catch (e) {
      dialog.showErrorBox('Songbook', `Could not start on port ${PORT}: ${e.message}\nIs another copy of Songbook or another program using it?`);
      return app.quit();
    }
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
