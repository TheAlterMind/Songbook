export interface ChordAnchor { offset: number; symbol: string }

/** Fields supplied by a source, not inferred from another recording. */
export interface SongMetadata {
  key?: string;
  capo?: number;
  tuning?: string[];
  tempo?: number;
  timeSignature?: string;
  duration?: number;
  artworkUrl?: string;
  album?: string;
  releaseDate?: string;
  year?: number;
  genre?: string;
  language?: string;
  difficulty?: string;
  recording?: string;
  mediaLinks?: { kind: string; label?: string; url: string }[];
  credits?: { role: string; name: string }[];
}

export interface SourceDetails {
  provider: string;
  providerSongId: string;
  sourceUrl?: string;
  metadata: SongMetadata;
}
