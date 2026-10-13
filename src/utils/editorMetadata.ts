import type { SongMetadata } from '../songMetadata';

type MetadataFields = { album: string; genre: string; language: string; year: string; key: string };

export function importedMetadataFields(metadata?: SongMetadata, album?: string): MetadataFields {
  return {
    album: album ?? metadata?.album ?? '',
    genre: metadata?.genre ?? '',
    language: metadata?.language ?? '',
    year: metadata?.year?.toString() ?? metadata?.releaseDate?.match(/^\d{4}(?:-|$)/)?.[0].slice(0, 4) ?? '',
    key: metadata?.key ?? '',
  };
}

// A year edit must not leave an older, more precise release date displayed as
// the current fact. Source snapshots keep that original date independently.
export function editedMetadata(metadata: SongMetadata | undefined, fields: MetadataFields): SongMetadata | undefined {
  if (!metadata) return undefined;
  const yearText = fields.year.trim();
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
  return {
    ...metadata,
    key: fields.key.trim() || undefined,
    album: fields.album.trim() || undefined,
    genre: fields.genre.trim() || undefined,
    language: fields.language.trim() || undefined,
    year,
    releaseDate: year !== undefined && metadata.releaseDate?.slice(0, 4) === yearText ? metadata.releaseDate : undefined,
  };
}
