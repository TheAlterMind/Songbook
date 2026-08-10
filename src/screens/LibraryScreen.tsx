import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getAllSongs, setFavorite, deleteSong, duplicateSong, Song } from '../db/Database';
import { sortSongs, SORT_OPTIONS } from '../utils/sort';
import { ExpandedViewIcon, CompactViewIcon, SortUpIcon, SortDownIcon, StarIcon, PlusIcon } from '../components/Icons';

export default function LibraryScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius, settings, updateSettings } = useTheme();
  const [songs, setSongs] = useState<Song[]>([]);

  const load = useCallback(async () => {
    setSongs(await getAllSongs());
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

  const cycleSortBy = () => {
    const order = SORT_OPTIONS.map((o) => o.value);
    const i = order.indexOf(settings.sortBy);
    updateSettings({ sortBy: order[(i + 1) % order.length] });
  };
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
        <Text style={[styles.h1, { color: colors.text }]}>Lyrics Library</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={toggleViewMode} style={[styles.iconBtn, { borderColor: colors.accent }]}>
            {isExpanded ? <ExpandedViewIcon color={colors.accent} size={16} /> : <CompactViewIcon color={colors.accent} size={16} />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sortRow}>
        <Text style={{ fontSize: 12, color: colors.neutral500 }}>Sorted by:</Text>
        <TouchableOpacity onPress={cycleSortBy}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent, marginLeft: 6 }}>{sortLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSortDir} style={{ marginLeft: 6, padding: 4 }}>
          {settings.sortDir === 'asc' ? <SortUpIcon color={colors.accent} /> : <SortDownIcon color={colors.accent} />}
        </TouchableOpacity>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, paddingBottom: 100, gap: isExpanded ? 8 : 2 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 40 }}>No songs yet. Tap + to add one.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Detail', { songId: item.id })}
            onLongPress={() => onLongPressSong(item)}
            style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, padding: isExpanded ? 12 : 11 }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                {item.title}
              </Text>
              {isExpanded && (
                <>
                  <Text style={{ fontSize: 12, color: colors.neutral500, marginTop: 2 }} numberOfLines={1}>
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
                <StarIcon color={item.favorite ? colors.accent : colors.neutral500} filled={!!item.favorite} />
              </TouchableOpacity>
            ) : (
              !!item.key && <Tag label={item.key} colors={colors} radius={radius} />
            )}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        onPress={() => navigation.navigate('Add')}
        style={[styles.fab, { borderColor: colors.accent, backgroundColor: colors.bg }]}
      >
        <PlusIcon color={colors.accent} size={20} />
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
      <Text style={{ fontSize: 11, color: accent ? colors.accent100 : colors.text }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  h1: { fontSize: 28, fontWeight: '700' },
  iconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
