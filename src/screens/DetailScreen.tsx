import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getSong, setFavorite, Song } from '../db/Database';
import { BackChevronIcon, CollectionsTabIcon, StarIcon, EditPencilIcon } from '../components/Icons';

export default function DetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { songId } = route.params;
  const { colors, settings } = useTheme();
  const [song, setSong] = useState<Song | null>(null);
  const [fontSize, setFontSize] = useState(settings.defaultFontSize);
  const [chordsOn, setChordsOn] = useState(settings.defaultChordsOn);

  useFocusEffect(
    useCallback(() => {
      getSong(songId).then((s) => setSong(s));
    }, [songId])
  );

  if (!song) return null;

  const hasChords = song.lines.some((l) => !!l.chord);

  const toggleFav = async () => {
    await setFavorite(songId, !song.favorite);
    setSong({ ...song, favorite: !song.favorite });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <BackChevronIcon color={colors.text} size={18} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }} numberOfLines={1}>
            {song.title}
          </Text>
          <Text style={{ fontSize: 12, color: colors.neutral500 }}>{song.artist}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('AddToCollection', { songId })} style={{ padding: 6 }}>
          <CollectionsTabIcon color={colors.accent} size={17} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleFav} style={{ padding: 6 }}>
          <StarIcon color={song.favorite ? colors.accent : colors.neutral500} filled={!!song.favorite} size={19} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Edit', { songId })} style={{ padding: 6 }}>
          <EditPencilIcon color={colors.accent} size={17} />
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => setFontSize((f) => Math.max(14, f - 1))} style={[styles.smallBtn, { borderColor: colors.divider }]}>
            <Text style={{ color: colors.text, fontSize: 12 }}>A−</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFontSize((f) => Math.min(28, f + 1))} style={[styles.smallBtn, { borderColor: colors.divider }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>A+</Text>
          </TouchableOpacity>
        </View>
        {hasChords && (
          <TouchableOpacity
            onPress={() => setChordsOn((v) => !v)}
            style={{
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: chordsOn ? colors.accent : colors.divider,
              backgroundColor: chordsOn ? colors.accent + '22' : 'transparent',
            }}
          >
            <Text style={{ fontSize: 12, color: chordsOn ? colors.accent : colors.neutral500 }}>Chords {chordsOn ? 'On' : 'Off'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {song.lines.map((line, i) => (
          <View key={i} style={{ marginBottom: 9 }}>
            {chordsOn && !!line.chord && (
              <Text style={{ fontSize, color: colors.accent, fontFamily: 'monospace', lineHeight: fontSize * 1.2 }}>{line.chord}</Text>
            )}
            <Text style={{ fontSize, color: colors.text, lineHeight: fontSize * 1.5 }}>{line.text}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbar: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
