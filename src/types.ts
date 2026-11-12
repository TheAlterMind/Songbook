export type RootStackParamList = {
  Library: undefined;
  Collections: undefined;
  Settings: undefined;
  WebSearch: undefined;
  Browser: { url: string; query: string };
  Add: { prefillLyrics?: string; prefillTitle?: string; prefillArtist?: string } | undefined;
  Edit: { songId: number };
  Detail: { songId: number };
  CollectionDetail: { collectionId: number };
  AddToCollection: { songId: number };
};
