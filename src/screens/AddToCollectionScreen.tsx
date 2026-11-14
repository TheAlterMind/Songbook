import React, { useCallback, useState } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, LAYOUT } from '../theme/tokens';
import { addCollection, getAllCollections, getSongCollectionIds, setSongInCollection, Collection } from '../db/Database';

export default function AddToCollectionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { songId } = route.params;
  const { colors, radius } = useTheme();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');

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

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = await addCollection(trimmed);
    await setSongInCollection(id, songId, true);
    setName('');
    load();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: LAYOUT.top, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.accent, fontSize: TYPE.body, fontWeight: '600' }}>Done</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: TYPE.body, fontWeight: '500' }}>
          Add to collection
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <FlatList
        data={collections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          // A new collection is created with this song already in it.
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={onCreate}
              returnKeyType="done"
              placeholder="New collection name"
              placeholderTextColor={colors.neutral500}
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.text,
              }}
            />
            <TouchableOpacity
              onPress={onCreate}
              style={{
                borderWidth: 1,
                borderColor: colors.accent,
                borderRadius: radius.md,
                paddingHorizontal: 16,
                justifyContent: 'center',
                opacity: name.trim() ? 1 : 0.4,
              }}
            >
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Create</Text>
            </TouchableOpacity>
          </View>
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
              <Text style={{ fontSize: TYPE.body, color: colors.text }}>{item.name}</Text>
              <Text style={{ color: checked ? colors.accent : colors.neutral500, fontSize: TYPE.body }}>
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
