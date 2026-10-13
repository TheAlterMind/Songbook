import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { searchSongs, Song } from '../db/Database';
import { SearchIcon, ChevronRightIcon } from '../components/Icons';

export default function LibrarySearchScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [searchError, setSearchError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    setSearchError('');
    setResults([]);
    if (query.trim()) {
      void searchSongs(query.trim()).then(
        (songs) => { if (active) setResults(songs); },
        () => { if (active) setSearchError('Your saved songs could not be searched. Please try again.'); },
      );
    }
    return () => { active = false; };
  }, [query]));

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: 54, paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Search</Text>
        <Text style={{ color: colors.neutral500, marginBottom: 8 }}>Search saved songs</Text>
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
            onChangeText={setQuery}
            placeholder="Title, artist, album, or a line…"
            accessibilityLabel="Search saved songs"
            testID="library-search-input"
            placeholderTextColor={colors.neutral500}
            style={{ flex: 1, color: colors.text, paddingVertical: 10 }}
          />
        </View>
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            navigation.navigate('WebSearch', { query: query.trim() });
          }}
          accessibilityRole="button"
          accessibilityLabel="Find lyrics on Genius"
          testID="library-search-genius"
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <SearchIcon color={colors.accent} size={18} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Find lyrics on Genius</Text>
            <Text style={{ color: colors.neutral500, lineHeight: 20 }}>Find a song online, then compare all six lyrics sources.</Text>
          </View>
          <ChevronRightIcon color={colors.accent} size={16} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.neutral500, marginTop: 60 }}>
            {searchError || (query.trim() ? `No saved songs found for "${query}". Try Genius above.` : 'Search your saved songs by title, artist, album or lyric text.')}
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
