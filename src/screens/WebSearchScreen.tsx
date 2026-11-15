import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Platform } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { BackChevronIcon, SearchIcon } from '../components/Icons';
import { ListItem, ListSection } from '../components/Controls';
import { formatDuration, lyricsOf, LrclibRecord, searchLyrics } from '../services/lrclib';
import { SOURCES } from '../services/extract';

export default function WebSearchScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, radius } = useTheme();
  const [q, setQ] = useState<string>(route.params?.query ?? '');
  const [results, setResults] = useState<LrclibRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const search = async () => {
    const query = q.trim();
    if (!query) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    setError('');
    try {
      setResults(await searchLyrics(query, ctrl.signal));
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setResults(null);
      setError(e?.message || 'Search failed. Check your connection and try again.');
    } finally {
      if (abort.current === ctrl) setLoading(false);
    }
  };

  const pick = (r: LrclibRecord) => {
    navigation.popTo('Add', {
      prefillTitle: r.trackName,
      prefillArtist: r.artistName,
      prefillAlbum: r.albumName ?? '',
      prefillLyrics: r.instrumental ? '(instrumental)' : lyricsOf(r),
      importedFrom: 'LRCLIB',
    });
  };

  const openSource = (id: keyof typeof SOURCES) => {
    const src = SOURCES[id];
    const url = src.searchUrl(q.trim());
    // The in-app browser (and page import) needs the native WebView; on web the site opens in a tab.
    if (Platform.OS === 'web') Linking.openURL(url);
    else navigation.navigate('Browser', { url, query: q.trim() });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ marginTop: LAYOUT.top, height: LAYOUT.headerHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityLabel="Back"
          style={{ width: LAYOUT.iconButton, height: LAYOUT.iconButton, alignItems: 'center', justifyContent: 'center' }}
        >
          <BackChevronIcon color={colors.text} size={ICON.button} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
          <Text numberOfLines={1} style={{ fontSize: TYPE.title, fontWeight: '500', color: colors.text }}>Find lyrics</Text>
        </TouchableOpacity>
        <TouchableOpacity
          // A new, empty form each time, even if an earlier Add screen is still in the history.
          onPress={() => navigation.push('Add')}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: TYPE.body, color: colors.accent }}>Add manually</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            paddingLeft: 12,
          }}
        >
          <SearchIcon color={colors.neutral500} size={ICON.inline} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={search}
            returnKeyType="search"
            autoFocus
            placeholder="Song title, artist or both"
            placeholderTextColor={colors.neutral500}
            style={{ flex: 1, padding: 12, fontSize: TYPE.body, color: colors.text }}
          />
          {loading && <ActivityIndicator color={colors.accent} style={{ marginRight: 12 }} />}
        </View>

        {!!error && <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>{error}</Text>}

        {results && results.length === 0 && !loading && (
          <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>
            No lyrics found on LRCLIB. Try fewer words, or look on one of the sites below.
          </Text>
        )}

        {results && results.length > 0 && (
          <ListSection header={`LRCLIB · ${results.length} ${results.length === 1 ? 'match' : 'matches'}`}>
            {results.map((r) => (
              <ListItem
                key={r.id}
                title={r.trackName}
                description={[r.artistName, r.albumName, formatDuration(r.duration), r.instrumental ? 'Instrumental' : '']
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => pick(r)}
              />
            ))}
          </ListSection>
        )}

        <ListSection header="Search other sites">
          {(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map((id) => (
            <ListItem
              key={id}
              title={SOURCES[id].name}
              description={Platform.OS === 'web' ? 'Opens in a new tab' : SOURCES[id].hint}
              onPress={() => openSource(id)}
            />
          ))}
        </ListSection>

        <Text style={{ fontSize: TYPE.small, lineHeight: TYPE.small * 1.5, color: colors.neutral500 }}>
          LRCLIB is a free, open lyrics database. On a song page from Genius or Ultimate Guitar, tap "Import" to bring the
          lyrics (and Ultimate Guitar's chords) straight into a new song.
        </Text>
      </ScrollView>
    </View>
  );
}
