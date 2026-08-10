import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getAllCollections, addCollection, deleteCollection, getCollectionSongIds, Collection } from '../db/Database';
import { ChevronRightIcon } from '../components/Icons';

export default function CollectionsScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius } = useTheme();
  const [collections, setCollections] = useState<(Collection & { count: number })[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const cols = await getAllCollections();
    const withCounts = await Promise.all(
      cols.map(async (c) => ({ ...c, count: (await getCollectionSongIds(c.id as number)).length }))
    );
    setCollections(withCounts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onAdd = async () => {
    if (!name.trim()) return;
    await addCollection(name.trim());
    setName('');
    load();
  };

  const onLongPress = (c: Collection) => {
    Alert.alert('Delete this collection?', c.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCollection(c.id as number);
          load();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, paddingTop: 54, paddingHorizontal: 20 }}>
        Collections
      </Text>
      <FlatList
        data={collections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('CollectionDetail', { collectionId: item.id })}
            onLongPress={() => onLongPress(item)}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: 14,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: colors.neutral500, marginTop: 2 }}>
                {item.count} {item.count === 1 ? 'song' : 'songs'}
              </Text>
            </View>
            <ChevronRightIcon color={colors.neutral500} size={14} />
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TextInput
              value={name}
              onChangeText={setName}
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
              onPress={onAdd}
              style={{
                borderWidth: 1,
                borderColor: colors.accent,
                borderRadius: radius.md,
                paddingHorizontal: 16,
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Add</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
