import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { searchSongs, Song } from '../db/Database';
import { SearchIcon, ChevronRightIcon } from '../components/Icons';

export default function LibrarySearchScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);

  const runSearch = async (q: string) => {
    setQuery(q);
    setResults(q.trim() ? await searchSongs(q.trim()) : []);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: 54, paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Search</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            paddingHorizontal: 12,
          }}
        >
          <View style={{ marginRight: 8 }}>
            <SearchIcon color={colors.neutral500} size={15} strokeWidth={2} />
          </View>
          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder="Title, artist, album, or a line\u2026"
            placeholderTextColor={colors.neutral500}
            style={{ flex: 1, color: colors.text, paddingVertical: 10 }}
          />
        </View>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 60 }}>
            {query.trim() ? `Nothing found for "${query}".` : 'Search across titles, artists, albums and lyric text.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Detail', { songId: item.id })}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{item.title}</Text>
              <Text style={{ fontSize: 14, color: colors.neutral500, marginTop: 2 }}>{item.artist}</Text>
            </View>
            <ChevronRightIcon color={colors.neutral500} size={14} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
