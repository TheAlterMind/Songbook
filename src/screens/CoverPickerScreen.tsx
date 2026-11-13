import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, LAYOUT } from '../theme/tokens';
import { getSong, setSongCover, Song } from '../db/Database';
import { searchCovers, CoverChoice } from '../services/coverSearch';
import { emitLibraryChanged } from '../utils/libraryEvents';
import { errorText, notify } from '../utils/notify';
import Cover from '../components/Cover';

/** Choose the album cover for a song by hand: search, tap a cover, or go back to automatic. */
export default function CoverPickerScreen() {
  const navigation = useNavigation<any>();
  const { songId } = useRoute<any>().params;
  const { colors, radius } = useTheme();
  const [song, setSong] = useState<Song | null>(null);
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<CoverChoice[] | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (q: string) => {
    setBusy(true);
    try {
      setChoices(await searchCovers(q));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    getSong(songId).then((s) => {
      setSong(s);
      if (s) {
        const q = [s.artist, s.album || s.title].filter(Boolean).join(' ');
        setQuery(q);
        search(q);
      }
    });
  }, [songId]);

  const choose = async (cover: string | null) => {
    try {
      await setSongCover(songId, cover);
      emitLibraryChanged();
      navigation.goBack();
    } catch (e) {
      notify('Could not save the cover', errorText(e));
    }
  };

  const tile = 96;
  const wide = { backgroundColor: colors.well, borderRadius: radius.md, height: LAYOUT.iconButton, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: TYPE.title, color: colors.accent }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: TYPE.title, color: colors.text, fontWeight: '500' }}>Cover</Text>
        <View style={{ width: 64 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Artist and album"
            placeholderTextColor={colors.neutral500}
            returnKeyType="search"
            onSubmitEditing={() => search(query)}
            autoCorrect={false}
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.divider,
              borderRadius: radius.md,
              paddingHorizontal: 12,
              height: LAYOUT.iconButton,
              color: colors.text,
              fontSize: TYPE.body,
            }}
          />
          <TouchableOpacity
            onPress={() => search(query)}
            style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 16, height: LAYOUT.iconButton, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: TYPE.body, color: colors.accent }}>Search</Text>
          </TouchableOpacity>
        </View>

        {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}
        {!busy && choices && choices.length === 0 && (
          <Text style={{ color: colors.neutral500, textAlign: 'center', marginTop: 20 }}>No covers found. Try other words.</Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {(choices || []).map((c) => (
            <TouchableOpacity key={c.url} onPress={() => choose(c.url)} style={{ width: tile }}>
              <Cover uri={c.url} size={tile} title={song?.title || ''} />
              <Text numberOfLines={2} style={{ fontSize: TYPE.tiny, color: colors.neutral500, marginTop: 4 }}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ gap: 10, marginTop: 10 }}>
          <TouchableOpacity onPress={() => choose(null)} style={wide}>
            <Text style={{ fontSize: TYPE.body, color: colors.text }}>Find it automatically again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => choose('')} style={wide}>
            <Text style={{ fontSize: TYPE.body, color: colors.text }}>No cover</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: LAYOUT.top, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
});
