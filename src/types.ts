export type RootStackParamList = {
  Tabs: undefined;
  WebSearch: undefined;
  Browser: { url: string; query: string };
  Add: { prefillLyrics?: string; prefillTitle?: string; prefillArtist?: string } | undefined;
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
