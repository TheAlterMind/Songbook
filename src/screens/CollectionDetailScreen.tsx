import React, { useCallback, useState } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../components/Typography';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { getCollectionSongIds, getSongsByIds, getAllCollections, setCollectionOrder, Song } from '../db/Database';
import { BackChevronIcon } from '../components/Icons';
import { errorText, notify } from '../utils/notify';

export default function CollectionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { collectionId } = route.params;
  const { colors, radius } = useTheme();
  const [songs, setSongs] = useState<Song[]>([]);
  const [name, setName] = useState('');
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    const ids = await getCollectionSongIds(collectionId);
    // getSongsByIds does not keep the order it is given, so put the songs back in the collection's order.
    const byId = new Map((await getSongsByIds(ids)).map((s) => [s.id as number, s]));
    setSongs(ids.map((id) => byId.get(id)).filter((s): s is Song => !!s));
    const cols = await getAllCollections();
    setName(cols.find((c) => c.id === collectionId)?.name || '');
  }, [collectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const queue = songs.map((s) => s.id as number);
  const open = (songId: number) => navigation.navigate('Detail', { songId, queue });

  const move = async (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= songs.length) return;
    const next = [...songs];
    [next[index], next[target]] = [next[target], next[index]];
    setSongs(next); // Show the move at once; the save follows.
    try {
      await setCollectionOrder(collectionId, next.map((s) => s.id as number));
    } catch (e) {
      notify('Could not save the order', errorText(e));
      load();
    }
  };

  const textButton = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
      <Text style={{ fontSize: TYPE.body, color: colors.accent }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: LAYOUT.top, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <BackChevronIcon color={colors.text} size={ICON.button} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPE.title, fontWeight: '500', color: colors.text, flex: 1 }} numberOfLines={1}>
          {name}
        </Text>
        {songs.length > 0 && !reordering && textButton('Play', () => open(queue[0]))}
        {songs.length > 1 && textButton(reordering ? 'Done' : 'Reorder', () => setReordering((r) => !r))}
      </View>
      <FlatList
        data={songs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 40 }}>No songs in this collection yet.</Text>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onPress={() => (reordering ? undefined : open(item.id as number))}
            activeOpacity={reordering ? 1 : 0.2}
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <Text style={{ width: 22, fontSize: TYPE.small, color: colors.neutral500, textAlign: 'right' }}>{index + 1}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: TYPE.body, fontWeight: '500', color: colors.text }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ fontSize: TYPE.small, color: colors.neutral500, marginTop: 2 }} numberOfLines={1}>
                {item.artist}
              </Text>
            </View>
            {reordering && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  accessibilityLabel={`Move ${item.title} up`}
                  disabled={index === 0}
                  onPress={() => move(index, -1)}
                  style={[styles.moveBtn, { borderColor: colors.divider, opacity: index === 0 ? 0.3 : 1 }]}
                >
                  <View style={{ transform: [{ rotate: '90deg' }] }}>
                    <BackChevronIcon color={colors.accent} size={ICON.button - 4} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel={`Move ${item.title} down`}
                  disabled={index === songs.length - 1}
                  onPress={() => move(index, 1)}
                  style={[styles.moveBtn, { borderColor: colors.divider, opacity: index === songs.length - 1 ? 0.3 : 1 }]}
                >
                  <View style={{ transform: [{ rotate: '-90deg' }] }}>
                    <BackChevronIcon color={colors.accent} size={ICON.button - 4} />
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  moveBtn: { width: 40, height: 36, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
