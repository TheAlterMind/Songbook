import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getAllCollections, getSongCollectionIds, setSongInCollection, Collection } from '../db/Database';

export default function AddToCollectionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { songId } = route.params;
  const { colors, radius } = useTheme();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setCollections(await getAllCollections());
    setMemberIds(new Set(await getSongCollectionIds(songId)));
  }, [songId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (collectionId: number) => {
    const isMember = memberIds.has(collectionId);
    await setSongInCollection(collectionId, songId, !isMember);
    load();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '600' }}>Done</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '600' }}>
          Add to collection
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <FlatList
        data={collections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 40 }}>
            No collections yet — create one from the Collections tab.
          </Text>
        }
        renderItem={({ item }) => {
          const checked = memberIds.has(item.id as number);
          return (
            <TouchableOpacity
              onPress={() => toggle(item.id as number)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                padding: 14,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 17, color: colors.text }}>{item.name}</Text>
              <Text style={{ color: checked ? colors.accent : colors.neutral500, fontSize: 18 }}>
                {checked ? '\u2713' : '\u25CB'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
