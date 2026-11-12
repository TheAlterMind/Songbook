import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { getAllSongs, setFavorite, deleteSong, duplicateSong, Song } from '../db/Database';
import { sortSongs, SORT_OPTIONS } from '../utils/sort';
import { ExpandedViewIcon, CompactViewIcon, SortUpIcon, SortDownIcon, StarIcon, PlusIcon } from '../components/Icons';
import { OptionSheet } from '../components/Controls';

export default function LibraryScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius, settings, updateSettings } = useTheme();
  const [songs, setSongs] = useState<Song[]>([]);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState('');

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

  const sorted = useMemo(
    () => sortSongs(songs, settings.sortBy, settings.sortDir),
    [songs, settings.sortBy, settings.sortDir]
  );

  const toggleSortDir = () => updateSettings({ sortDir: settings.sortDir === 'asc' ? 'desc' : 'asc' });
  const toggleViewMode = () => updateSettings({ viewMode: settings.viewMode === 'expanded' ? 'compact' : 'expanded' });

  const toggleFav = async (song: Song) => {
    await setFavorite(song.id as number, !song.favorite);
    load();
  };

  const onLongPressSong = (song: Song) => {
    Alert.alert(song.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Duplicate',
        onPress: async () => {
          await duplicateSong(song.id as number);
          load();
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSong(song.id as number);
          load();
        },
      },
    ]);
  };

  const sortLabel = (SORT_OPTIONS.find((o) => o.value === settings.sortBy) || SORT_OPTIONS[0]).label;
  const isExpanded = settings.viewMode === 'expanded';

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.h1, { color: colors.text }]}>Songbook</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={toggleViewMode} style={styles.iconBtn}>
            {isExpanded ? <ExpandedViewIcon color={colors.accent} size={ICON.button} /> : <CompactViewIcon color={colors.accent} size={ICON.button} />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sortRow}>
        <TouchableOpacity
          onPress={() => setSortMenuOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 12 }}
        >
          <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>Sorted by:</Text>
          <Text style={{ fontSize: TYPE.label, fontWeight: '600', color: colors.accent, marginLeft: 6 }}>{sortLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSortDir} style={styles.iconBtn}>
          {settings.sortDir === 'asc' ? <SortUpIcon color={colors.accent} size={ICON.button} /> : <SortDownIcon color={colors.accent} size={ICON.button} />}
        </TouchableOpacity>
      </View>

      <OptionSheet
        visible={sortMenuOpen}
        title="Sort by"
        options={SORT_OPTIONS}
        value={settings.sortBy}
        onPick={(v) => updateSettings({ sortBy: v })}
        onClose={() => setSortMenuOpen(false)}
      />

      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 18, paddingTop: 8, paddingBottom: 100, gap: isExpanded ? 8 : 2 }}
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
            <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 40 }}>No songs yet. Tap + to add one.</Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Detail', { songId: item.id })}
            onLongPress={() => onLongPressSong(item)}
            style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, padding: isExpanded ? 12 : 11 }]}
          >
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
        )}
      />

      <TouchableOpacity
        onPress={() => navigation.navigate('Add')}
        style={[styles.fab, { borderColor: colors.accent, backgroundColor: colors.accent }]}
      >
        <PlusIcon color={colors.accent100} size={ICON.button} />
      </TouchableOpacity>
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
  iconBtn: { width: LAYOUT.iconButton, height: LAYOUT.iconButton, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: LAYOUT.round,
    height: LAYOUT.round,
    borderRadius: LAYOUT.round / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
