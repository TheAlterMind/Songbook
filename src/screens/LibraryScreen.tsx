import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, TouchableOpacity, Pressable, StyleSheet, BackHandler } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { getAllSongs, searchSongs, setFavorite, duplicateSong, Song } from '../db/Database';
import { deleteWithUndo } from '../utils/undoDelete';
import { onLibraryChanged } from '../utils/libraryEvents';
import { useToast } from '../components/Toast';
import SwipeRow, { SwipeRowHandle } from '../components/SwipeRow';
import { sortSongs, SORT_OPTIONS } from '../utils/sort';
import { backfillCovers } from '../services/covers';
import Cover from '../components/Cover';
import { ExpandedViewIcon, CompactViewIcon, SortUpIcon, SortDownIcon, StarIcon, SearchIcon } from '../components/Icons';

export default function LibraryScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius, settings, updateSettings } = useTheme();
  const { showUndo } = useToast();
  const rowRefs = useRef<Record<number, SwipeRowHandle | null>>({});
  const [songs, setSongs] = useState<Song[]>([]);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [rowSize, setRowSize] = useState({ y: 0, h: 0, w: 0 });
  const [groupX, setGroupX] = useState(0);
  const [labelBox, setLabelBox] = useState({ x: 0, w: 0 });
  const [matches, setMatches] = useState<Song[] | null>(null);

  const load = useCallback(async () => {
    try {
      setSongs(await getAllSongs());
      setLoadError('');
    } catch (e: any) {
      setLoadError(e?.message || 'Could not open your library.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Reload when something changed elsewhere, such as Undo on a deleted song.
  useEffect(() => onLibraryChanged(load), [load]);

  // The Back key closes the sort menu instead of leaving the app.
  useEffect(() => {
    if (!sortMenuOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSortMenuOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [sortMenuOpen]);

  // Songs without a cover get one looked up in the background; each cover appears as it is found.
  useEffect(() => {
    if (!songs.some((s) => s.cover == null)) return;
    backfillCovers(songs, (id, cover) => setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, cover } : s))));
  }, [songs]);

  // Searching covers titles, artists, albums and lyric text; the results keep the chosen sort order.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches(null);
      return;
    }
    let stale = false;
    searchSongs(q)
      .then((r) => !stale && setMatches(r))
      .catch(() => !stale && setMatches([]));
    return () => {
      stale = true;
    };
  }, [query, songs]);

  const sorted = useMemo(
    () => sortSongs(matches ?? songs, settings.sortBy, settings.sortDir),
    [songs, matches, settings.sortBy, settings.sortDir]
  );

  const toggleSortDir = () => updateSettings({ sortDir: settings.sortDir === 'asc' ? 'desc' : 'asc' });
  const toggleViewMode = () => updateSettings({ viewMode: settings.viewMode === 'expanded' ? 'compact' : 'expanded' });

  const toggleFav = async (song: Song) => {
    await setFavorite(song.id as number, !song.favorite);
    load();
  };

  const actionsFor = (song: Song) => [
    {
      label: song.favorite ? 'Unfavorite' : 'Favorite',
      background: colors.accent,
      color: colors.accent100,
      onPress: () => toggleFav(song),
    },
    {
      label: 'Duplicate',
      background: colors.well,
      color: colors.text,
      onPress: async () => {
        await duplicateSong(song.id as number);
        load();
      },
    },
    {
      label: 'Delete',
      background: '#ff4d4f',
      color: '#fff',
      onPress: () => deleteWithUndo(song, showUndo).catch(() => {}),
    },
  ];

  const sortLabel = (SORT_OPTIONS.find((o) => o.value === settings.sortBy) || SORT_OPTIONS[0]).label;
  const isExpanded = settings.viewMode === 'expanded';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View
        style={styles.headerRow}
        onLayout={(ev) => {
          const { y, height, width } = ev.nativeEvent.layout;
          setRowSize({ y, h: height, w: width });
        }}
      >
        {searchOpen ? (
          // Search open: the whole header row becomes the field.
          <>
            <View style={[styles.search, { borderColor: colors.divider, borderRadius: radius.md }]}>
              <SearchIcon color={colors.neutral500} size={ICON.small} strokeWidth={2} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={colors.neutral500}
                returnKeyType="search"
                autoCorrect={false}
                style={[styles.searchInput, { color: colors.text, fontSize: TYPE.body }]}
              />
            </View>
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setSearchOpen(false);
              }}
              style={{ paddingVertical: 10, paddingHorizontal: 8 }}
            >
              <Text style={{ fontSize: TYPE.label, color: colors.accent }}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text numberOfLines={1} style={[styles.h1, { color: colors.text, flexShrink: 1 }]}>Songbook</Text>
            <View style={styles.tools} onLayout={(ev) => setGroupX(ev.nativeEvent.layout.x)}>
              <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.iconBtn}>
                <SearchIcon color={colors.accent} size={ICON.button} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSortMenuOpen((o) => !o)}
                onLayout={(ev) => setLabelBox({ x: ev.nativeEvent.layout.x, w: ev.nativeEvent.layout.width })}
                hitSlop={{ top: 10, bottom: 10, left: 2, right: 2 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: LAYOUT.iconButton, paddingHorizontal: 8 }}
              >
                <Text numberOfLines={1} style={{ fontSize: TYPE.title, fontWeight: '400', color: colors.accent }}>{sortLabel}</Text>
                {settings.sortDir === 'asc' ? <SortDownIcon color={colors.accent} size={20} /> : <SortUpIcon color={colors.accent} size={20} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleViewMode} style={styles.iconBtn}>
                {isExpanded ? <ExpandedViewIcon color={colors.accent} size={ICON.button} /> : <CompactViewIcon color={colors.accent} size={ICON.button} />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 18, paddingTop: 15, paddingBottom: 18, gap: 8 }}
        ListEmptyComponent={
          loadError ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 10, marginTop: 24 }}>
              <Text style={{ fontSize: TYPE.body, color: colors.text }}>Your library can't be opened here</Text>
              <Text style={{ fontSize: TYPE.small, lineHeight: TYPE.small * 1.5, color: colors.neutral500 }}>{loadError}</Text>
              <TouchableOpacity
                onPress={load}
                style={{ backgroundColor: colors.well, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: TYPE.body, color: colors.text }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            query.trim() ? (
              <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 40 }}>
                Nothing found for "{query.trim()}".
              </Text>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: 20, gap: 14, marginTop: 24 }}>
                <Text style={{ fontSize: TYPE.title, fontWeight: '500', color: colors.text }}>Your songbook is empty</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('WebSearch', { query: '' })}
                  style={{ backgroundColor: colors.accent, borderRadius: radius.md, height: LAYOUT.iconButton, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: TYPE.body, color: colors.accent100 }}>Find lyrics</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Add')}
                  style={{ backgroundColor: colors.well, borderRadius: radius.md, height: LAYOUT.iconButton, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: TYPE.body, color: colors.text }}>Paste lyrics</Text>
                </TouchableOpacity>
              </View>
            )
          )
        }
        renderItem={({ item }) => (
          <SwipeRow ref={(h) => { rowRefs.current[item.id as number] = h; }} actions={actionsFor(item)} radius={radius.md}>
          <TouchableOpacity
            onPress={() => {
              const row = rowRefs.current[item.id as number];
              if (row?.isOpen()) row.close();
              else navigation.navigate('Detail', { songId: item.id });
            }}
            onLongPress={() => rowRefs.current[item.id as number]?.open()}
            style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, padding: isExpanded ? 12 : 11 }]}
          >
            <Cover uri={item.cover} size={isExpanded ? 64 : 36} title={item.title} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: TYPE.body, fontWeight: '500', color: colors.text }} numberOfLines={1}>
                {item.title}
              </Text>
              {isExpanded && (
                <>
                  <Text style={{ fontSize: TYPE.small, color: colors.neutral500, marginTop: 2 }} numberOfLines={1}>
                    {item.artist}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {!!item.key && <Tag label={item.key} accent colors={colors} radius={radius} />}
                    {!!item.genre && <Tag label={item.genre} colors={colors} radius={radius} />}
                    {!!item.mood && <Tag label={item.mood} colors={colors} radius={radius} />}
                    {!!item.year && <Tag label={item.year} colors={colors} radius={radius} />}
                  </View>
                </>
              )}
            </View>
            {isExpanded ? (
              <TouchableOpacity onPress={() => toggleFav(item)} style={{ padding: 6 }}>
                <StarIcon color={item.favorite ? colors.accent : colors.neutral500} filled={!!item.favorite} size={ICON.inline} />
              </TouchableOpacity>
            ) : (
              !!item.key && <Tag label={item.key} colors={colors} radius={radius} />
            )}
          </TouchableOpacity>
          </SwipeRow>
        )}
      />

      {sortMenuOpen && !searchOpen && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortMenuOpen(false)} />
          {/* Drops from the sort label: top edge on the row's bottom, right edge on the label's. */}
          <View
            style={[
              styles.dropdown,
              {
                top: rowSize.y + rowSize.h - 2,
                right: Math.max(8, rowSize.w - (groupX + labelBox.x + labelBox.w)),
                backgroundColor: colors.surface,
                borderColor: colors.divider,
                borderRadius: radius.md,
              },
            ]}
          >
            {SORT_OPTIONS.map((o) => {
              const on = o.value === settings.sortBy;
              return (
                <TouchableOpacity
                  key={o.value}
                  onPress={() => {
                    // Tapping the current field flips the direction; another field switches to it.
                    if (on) {
                      toggleSortDir();
                    } else {
                      updateSettings({ sortBy: o.value });
                      setSortMenuOpen(false);
                    }
                  }}
                  style={[styles.dropdownItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }]}
                >
                  <Text style={{ fontSize: TYPE.body, fontWeight: on ? '600' : '400', color: on ? colors.accent : colors.text }}>{o.label}</Text>
                  {on && (settings.sortDir === 'asc' ? <SortDownIcon color={colors.accent} size={ICON.small} /> : <SortUpIcon color={colors.accent} size={ICON.small} />)}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function Tag({ label, accent, colors, radius }: any) {
  return (
    <View
      style={{
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: radius.sm,
        backgroundColor: accent ? colors.accent : colors.neutral800,
      }}
    >
      <Text style={{ fontSize: TYPE.tiny, color: accent ? colors.accent100 : colors.text }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Sitness .head: a 56px row, 18px page margin; icon buttons reach into the right margin.
  headerRow: {
    marginTop: LAYOUT.top,
    height: LAYOUT.headerHeight,
    paddingLeft: 18,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  h1: { fontSize: TYPE.title, fontWeight: '500' },
  tools: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, marginRight: -8 },
  iconBtn: { width: 56, height: LAYOUT.iconButton, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginRight: 4, borderWidth: 1 },
  dropdown: {
    position: 'absolute',
    minWidth: 170,
    borderWidth: 1,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  dropdownItem: { height: 44, paddingHorizontal: 16, justifyContent: 'center' },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
