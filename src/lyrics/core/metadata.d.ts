import type { SongMetadata } from '../../songMetadata';
export function httpsUrl(value: unknown): string | undefined;
export function sanitizeMetadata(value: unknown): SongMetadata | undefined;
export function geniusMetadata(value: Record<string, unknown>): SongMetadata | undefined;
export function deezerHttpsUrl(value: unknown): string | undefined;
export function deezerMetadata(value: Record<string, unknown>): SongMetadata | undefined;
export function thumbnailUrl(value: unknown): string | undefined;
