import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getCollectionSongIds, getSongsByIds, getAllCollections, Song } from '../db/Database';
import { BackChevronIcon } from '../components/Icons';

export default function CollectionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { collectionId } = route.params;
  const { colors, radius } = useTheme();
  const [songs, setSongs] = useState<Song[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const ids = await getCollectionSongIds(collectionId);
    setSongs(await getSongsByIds(ids));
    const cols = await getAllCollections();
    setName(cols.find((c) => c.id === collectionId)?.name || '');
  }, [collectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <BackChevronIcon color={colors.text} size={18} />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <FlatList
        data={songs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 40 }}>No songs in this collection yet.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Detail', { songId: item.id })}
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: 14 }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{item.title}</Text>
            <Text style={{ fontSize: 14, color: colors.neutral500, marginTop: 2 }}>{item.artist}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
