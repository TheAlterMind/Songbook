import type { LyricsProvenance, SongLine } from './db/Database';
import type { SongMetadata, SourceDetails } from './songMetadata';

export type LyricsImportDraft = {
  importId: string;
  title: string;
  artist: string;
  album?: string;
  plainLyrics: string;
  lyricsSource: LyricsProvenance;
  lines?: SongLine[];
  metadata?: SongMetadata;
  sourceDetails?: SourceDetails[];
};

export type RootStackParamList = {
  Tabs: undefined;
  WebSearch: { query?: string; returnToAdd?: boolean } | undefined;
  Browser: { url: string; query: string };
  Add: { prefillLyrics?: string; prefillTitle?: string; prefillArtist?: string; lyricsImport?: LyricsImportDraft } | undefined;
  Edit: { songId: number };
  Detail: { songId: number };
  CollectionDetail: { collectionId: number };
  AddToCollection: { songId: number };
};

export type TabParamList = {
  Library: undefined;
  LibrarySearch: undefined;
  Collections: undefined;
  Settings: undefined;
};
