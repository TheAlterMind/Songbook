import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { BackChevronIcon, SearchIcon } from '../components/Icons';
import { findLyrics, PROVIDERS, searchSongs } from '../lyrics';
import type { DiscoveryResult, LyricsResult, ProviderCheck, SongResult } from '../lyrics/types';
import type { LyricsImportDraft, RootStackParamList } from '../types';
import type { SongMetadata, SourceDetails } from '../songMetadata';
import SongArrangement from '../components/SongArrangement';
import SongMetadataPanel from '../components/SongMetadataPanel';
import { lineHasChords } from '../utils/arrangement';

type Props = NativeStackScreenProps<RootStackParamList, 'WebSearch'>;
const sourceKey = (source: LyricsResult) => `${source.song.provider}:${source.song.id}`;
const providerName = (id: string) => PROVIDERS.find((provider) => provider.id === id)?.name ?? id;
const readableError = (error: unknown) => error instanceof Error ? error.message : 'The request could not finish. Please try again.';
const sourceMetadata = (song: SongResult): SongMetadata => ({
  ...(song.album ? { album: song.album } : {}),
  ...(song.duration !== null ? { duration: song.duration } : {}),
  ...song.metadata,
});
const sourceDetails = (sources: LyricsResult[]): SourceDetails[] => sources.map(({ song }) => ({
  provider: song.provider, providerSongId: String(song.id), sourceUrl: song.url, metadata: sourceMetadata(song),
}));

export default function WebSearchScreen({ navigation, route }: Props) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(route.params?.query ?? '');
  const [results, setResults] = useState<SongResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SongResult | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [selectedSource, setSelectedSource] = useState<LyricsResult | null>(null);
  const [checks, setChecks] = useState<ProviderCheck[]>([]);
  const [busy, setBusy] = useState<'search' | 'lyrics' | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const imported = useRef(false);

  const invalidateRequest = useCallback(() => {
    requestVersion.current += 1;
    request.current?.abort();
    request.current = null;
  }, []);
  useFocusEffect(useCallback(() => {
    imported.current = false;
    return invalidateRequest;
  }, [invalidateRequest]));

  const beginRequest = () => {
    invalidateRequest();
    const controller = new AbortController();
    request.current = controller;
    return { controller, version: requestVersion.current };
  };
  const runSearch = async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    const { controller, version } = beginRequest();
    setBusy('search'); setError(''); setSelectedSong(null); setSelectedSource(null);
    setDiscovery(null); setResults([]); setSearched(false);
    try {
      const songs = await searchSongs(query.trim(), { signal: controller.signal });
      if (version !== requestVersion.current) return;
      setResults(songs); setSearched(true);
    } catch (failure) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(readableError(failure));
    } finally {
      if (version === requestVersion.current) setBusy(null);
    }
  };
  const selectSong = async (song: SongResult) => {
    Keyboard.dismiss();
    const { controller, version } = beginRequest();
    setSelectedSong(song); setDiscovery(null); setSelectedSource(null); setError(''); setBusy('lyrics');
    setChecks(PROVIDERS.map(({ id }) => ({ provider: id, state: 'pending' })));
    try {
      const found = await findLyrics(song, {
        signal: controller.signal,
        onProgress: (check) => {
          if (version !== requestVersion.current || controller.signal.aborted) return;
          setChecks((current) => current.map((item) => item.provider === check.provider ? check : item));
        },
      });
      if (version !== requestVersion.current) return;
      setDiscovery(found); setChecks(found.checks); setSelectedSource(found.best);
    } catch (failure) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(readableError(failure));
    } finally {
      if (version === requestVersion.current) setBusy(null);
    }
  };
  const cancelWork = () => {
    const wasSearching = busy === 'search';
    invalidateRequest(); setBusy(null); setChecks([]);
    setError(wasSearching ? 'Search cancelled. You can search again.' : 'Lyrics check cancelled. Tap Retry to check again.');
  };
  const returnToResults = () => {
    invalidateRequest(); setBusy(null); setSelectedSong(null); setSelectedSource(null);
    setDiscovery(null); setChecks([]); setError('');
  };
  const useLyrics = () => {
    if (!selectedSource?.plainLyrics.trim() || imported.current || busy) return;
    imported.current = true;
    const source = selectedSource;
    const hasChords = source.lines?.some(lineHasChords);
    const metadata = sourceMetadata(source.song);
    // Artwork identifies the song; arrangement-specific fields come only from
    // the chosen source. Other recordings' details remain in source snapshots.
    if (!metadata.artworkUrl) metadata.artworkUrl = selectedSong?.metadata?.artworkUrl ?? discovery?.sources.find((item) => item.song.metadata?.artworkUrl)?.song.metadata?.artworkUrl;
    const draft: LyricsImportDraft = {
      importId: `${Date.now()}-${sourceKey(source)}`,
      title: hasChords ? source.song.title : selectedSong?.title ?? source.song.title,
      artist: hasChords ? source.song.artist : selectedSong?.artist ?? source.song.artist,
      album: metadata.album ?? (hasChords ? undefined : selectedSong?.album ?? undefined),
      plainLyrics: (source.lines?.length ? source.lines.map((line) => line.text).join('\n') : source.plainLyrics).replace(/\r\n?/g, '\n'),
      lines: source.lines,
      metadata,
      sourceDetails: sourceDetails(discovery?.sources ?? [source]),
      lyricsSource: {
        provider: source.song.provider,
        providerSongId: String(source.song.id),
        sourceUrl: source.song.url,
        ...(source.attribution ? { attribution: source.attribution } : {}),
        retrievedAt: Date.now(),
      },
    };
    if (route.params?.returnToAdd) navigation.popTo('Add', { lyricsImport: draft });
    else navigation.replace('Add', { lyricsImport: draft });
  };

  const completed = checks.filter((check) => check.state !== 'pending').length;
  const bestSelected = !!selectedSource && !!discovery?.best && sourceKey(selectedSource) === sourceKey(discovery.best);
  const buttonStyle = { borderRadius: radius.md, padding: 14, alignItems: 'center' as const, backgroundColor: colors.accent };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity onPress={() => selectedSong ? returnToResults() : navigation.goBack()} accessibilityRole="button" accessibilityLabel={selectedSong ? 'Back to search results' : route.params?.returnToAdd ? 'Back to add song' : 'Back to search'} style={{ padding: 10 }}>
          <BackChevronIcon color={colors.text} size={18} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 23, fontWeight: '700', flex: 1 }}>Find lyrics</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 20) + 20, gap: 16 }}>
        {!selectedSong ? (
          <>
            <Text style={{ color: colors.neutral500, lineHeight: 21 }}>Find a song on Genius, then compare lyrics and chord arrangements from {PROVIDERS.length} sources.</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12 }}>
              <SearchIcon color={colors.neutral500} size={16} />
              <TextInput value={query} onChangeText={(value) => {
                invalidateRequest(); setBusy(null); setQuery(value); setResults([]); setSearched(false); setError('');
              }} onSubmitEditing={runSearch} returnKeyType="search" autoCorrect={false} maxLength={200}
                placeholder="Song title and artist" placeholderTextColor={colors.neutral500}
                accessibilityLabel="Song title and artist" testID="lyrics-search-input"
                style={{ flex: 1, padding: 14, color: colors.text, fontSize: 16 }} />
            </View>
            <TouchableOpacity onPress={runSearch} disabled={!query.trim() || busy === 'search'} accessibilityRole="button" accessibilityLabel="Search Genius" testID="lyrics-search-submit"
              accessibilityState={{ disabled: !query.trim() || busy === 'search' }} style={[buttonStyle, { opacity: !query.trim() || busy === 'search' ? 0.5 : 1 }]}>
              <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 16 }}>Search Genius</Text>
            </TouchableOpacity>
            {searched && !results.length && <Text style={{ color: colors.text, lineHeight: 23 }}>No songs found. Try a shorter title or add the artist's name.</Text>}
            {results.map((song) => (
              <TouchableOpacity key={`${song.provider}:${song.id}`} onPress={() => selectSong(song)} accessibilityRole="button"
                accessibilityLabel={`Find lyrics for ${song.title} by ${song.artist}`} testID={`lyrics-result-${song.id}`}
                style={{ padding: 16, backgroundColor: colors.surface, borderRadius: radius.lg, gap: 5 }}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18 }}>{song.title}</Text>
                <Text style={{ color: colors.neutral500, fontSize: 15 }}>{song.artist}</Text>
                {!!song.album && <Text style={{ color: colors.neutral500, fontSize: 13 }}>{song.album}</Text>}
                <Text style={{ color: colors.accent, marginTop: 6 }}>Check all lyrics sources</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <View style={{ gap: 5 }}>
              <Text style={{ color: colors.text, fontSize: 25, fontWeight: '700' }}>{selectedSong.title}</Text>
              <Text style={{ color: colors.neutral500, fontSize: 17 }}>{selectedSong.artist}</Text>
              {!!selectedSong.album && <Text style={{ color: colors.neutral500 }}>{selectedSong.album}</Text>}
            </View>
            {checks.length > 0 && <View style={{ gap: 10, padding: 14, backgroundColor: colors.surface, borderRadius: radius.lg }}>
              <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontWeight: '600' }}>{busy === 'lyrics' ? `Checking sources · ${completed} of ${PROVIDERS.length}` : 'Sources checked'}</Text>
              {checks.map((check) => <View key={check.provider} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ color: colors.text, flex: 1 }}>{providerName(check.provider)}</Text>
                <Text style={{ color: check.state === 'found' ? colors.accent : colors.neutral500, flexShrink: 1, textAlign: 'right' }}>{check.state === 'pending' ? 'Checking…' : check.state === 'found' ? 'Lyrics found' : check.state === 'failed' ? 'Could not check' : 'No lyrics found'}</Text>
              </View>)}
            </View>}
            {!!discovery?.sources.length && <View style={{ gap: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Available lyrics</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{discovery.sources.map((source) => {
                const active = !!selectedSource && sourceKey(source) === sourceKey(selectedSource);
                return <TouchableOpacity key={sourceKey(source)} onPress={() => setSelectedSource(source)} accessibilityRole="button"
                  accessibilityLabel={`Lyrics from ${providerName(source.song.provider)}`} accessibilityState={{ selected: active }} testID={`lyrics-source-${source.song.provider}`}
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: active ? colors.accent : colors.divider, backgroundColor: active ? colors.accent : colors.surface }}>
                  <Text style={{ color: active ? colors.bg : colors.text, fontWeight: active ? '700' : '400' }}>{providerName(source.song.provider)}{source.lines?.some(lineHasChords) ? ' · Chords' : ''}</Text>
                </TouchableOpacity>;
              })}</View>
            </View>}
            {selectedSource && <>
              <View style={{ gap: 5 }} testID="lyrics-selected-source">
                <Text style={{ color: colors.accent, fontWeight: '600' }}>{bestSelected ? 'Best match selected' : 'Your selected source'}</Text>
                <Text style={{ color: colors.neutral500, lineHeight: 21 }}>{selectedSource.quality.reason}</Text>
                {selectedSource.lines?.some(lineHasChords) && <Text style={{ color: colors.text, lineHeight: 21 }}>Lyrics and chords from the same arrangement: {selectedSource.song.title}.{selectedSource.match.kind === 'same-song' ? ' This arrangement may differ from the selected recording.' : ''}</Text>}
                {selectedSource.attribution && <Text style={{ color: colors.neutral500, fontSize: 13 }}>{selectedSource.attribution.text || `Lyrics supplied by ${selectedSource.attribution.name}`}</Text>}
              </View>
              <TouchableOpacity onPress={useLyrics} accessibilityRole="button" accessibilityLabel="Use these lyrics" testID="lyrics-import" style={buttonStyle}>
                <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 16 }}>{selectedSource.lines?.some(lineHasChords) ? 'Use lyrics and chords' : 'Use these lyrics'}</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.neutral500, fontSize: 13 }}>Review and save the song on the next screen.</Text>
              <SongMetadataPanel metadata={sourceMetadata(selectedSource.song)} sourceDetails={sourceDetails(discovery?.sources ?? [selectedSource])} />
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16 }}>
                {selectedSource.lines?.some(lineHasChords) ? <SongArrangement lines={selectedSource.lines} /> : <Text selectable style={{ color: colors.text, fontSize: 17, lineHeight: 27 }}>{selectedSource.plainLyrics}</Text>}
              </View>
            </>}
            {discovery && !discovery.best && <Text style={{ color: colors.text, lineHeight: 23 }}>No usable lyrics were found for this song. Try a different recording, retry the search, or paste lyrics in the editor.</Text>}
            {checks.some((check) => check.state === 'failed') && busy !== 'lyrics' && <View style={{ gap: 6 }}>
              <Text style={{ color: colors.neutral500, lineHeight: 20 }}>Some sources could not be checked. Their lyrics may still be available.</Text>
              {checks.filter((check) => check.state === 'failed' && check.message).map((check) => <Text key={check.provider} style={{ color: colors.neutral500, fontSize: 13 }}>{providerName(check.provider)}: {check.message}</Text>)}
            </View>}
            {!busy && (error || (discovery && (!discovery.best || discovery.checks.some((check) => check.state === 'failed')))) && <TouchableOpacity onPress={() => selectSong(selectedSong)} accessibilityRole="button" style={{ borderWidth: 1, borderColor: colors.accent, padding: 13, alignItems: 'center', borderRadius: radius.md }}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Retry lyrics search</Text>
            </TouchableOpacity>}
          </>
        )}
        {!!error && <Text accessibilityRole="alert" style={{ color: colors.text, lineHeight: 23 }}>{error}</Text>}
        {busy && <View style={{ gap: 12, alignItems: 'center', paddingVertical: 10 }}>
          <ActivityIndicator color={colors.accent} />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.neutral500 }}>{busy === 'search' ? 'Searching Genius…' : 'Comparing lyrics. Some sources take longer.'}</Text>
          <TouchableOpacity onPress={cancelWork} accessibilityRole="button" style={{ padding: 10 }}><Text style={{ color: colors.accent }}>Cancel request</Text></TouchableOpacity>
        </View>}
      </ScrollView>
    </View>
  );
}
