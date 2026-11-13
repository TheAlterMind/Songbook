import type { Snapshot } from './merge';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const BACKUP_NAME = 'songbook.json';

/** The only Drive permission the app asks for: a hidden folder that only this app can see. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export class DriveAuthError extends Error {
  constructor() {
    super('Google Drive sign-in expired. Sign in again.');
    this.name = 'DriveAuthError';
  }
}

async function check(res: Response, what: string): Promise<Response> {
  if (res.status === 401 || res.status === 403) throw new DriveAuthError();
  if (!res.ok) throw new Error(`Google Drive ${what} failed (${res.status}).`);
  return res;
}

/** Finds the backup file in the app's hidden folder; null if there is none yet. */
async function findBackupId(token: string): Promise<string | null> {
  const query = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${BACKUP_NAME}' and trashed=false`,
    fields: 'files(id)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  });
  const res = await check(await fetch(`${FILES_URL}?${query}`, { headers: { Authorization: `Bearer ${token}` } }), 'lookup');
  const body = await res.json();
  return body.files?.[0]?.id ?? null;
}

/** Downloads the stored library snapshot; null when nothing has been uploaded yet. */
export async function downloadSnapshot(token: string): Promise<Snapshot | null> {
  const id = await findBackupId(token);
  if (!id) return null;
  const res = await check(await fetch(`${FILES_URL}/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } }), 'download');
  const data = await res.json();
  if (!data || data.version !== 2 || !Array.isArray(data.songs)) throw new Error('The Drive backup is not a Songbook backup this version understands.');
  return data as Snapshot;
}

/** Stores the snapshot, replacing the previous one (or creating the file the first time). */
export async function uploadSnapshot(token: string, snapshot: Snapshot): Promise<void> {
  const id = await findBackupId(token);
  const boundary = `songbook-${Math.random().toString(36).slice(2)}`;
  const metadata = id ? {} : { name: BACKUP_NAME, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(snapshot)}\r\n--${boundary}--`;
  const res = await fetch(`${UPLOAD_URL}${id ? `/${id}` : ''}?uploadType=multipart`, {
    method: id ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  await check(res, 'upload');
}
