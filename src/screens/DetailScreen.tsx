import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { getSong, setFavorite, Song } from '../db/Database';
import { Switch } from '../components/Controls';
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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconBtn}
        >
          <BackChevronIcon color={colors.text} size={ICON.button} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
          <Text style={{ fontSize: TYPE.title, fontWeight: '500', color: colors.text }} numberOfLines={1}>
            {song.title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('AddToCollection', { songId })}
          style={styles.iconBtn}
        >
          <CollectionsTabIcon color={colors.accent} size={ICON.button} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleFav} style={styles.iconBtn}>
          <StarIcon color={song.favorite ? colors.accent : colors.neutral500} filled={!!song.favorite} size={ICON.button} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Edit', { songId })}
          style={styles.iconBtn}
        >
          <EditPencilIcon color={colors.accent} size={ICON.button} />
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => setFontSize((f) => Math.max(16, f - 1))}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.smallBtn, { flex: 1, borderColor: colors.divider }]}
          >
            <Text style={{ color: colors.accent, fontSize: TYPE.small }}>A−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFontSize((f) => Math.min(30, f + 1))}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.smallBtn, { flex: 1, borderColor: colors.divider }]}
          >
            <Text style={{ color: colors.accent, fontSize: TYPE.body }}>A+</Text>
          </TouchableOpacity>
          {hasChords && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 6 }}>
              <Text style={{ fontSize: TYPE.label, color: colors.text }}>Chords</Text>
              <Switch value={chordsOn} onChange={setChordsOn} />
            </View>
          )}
        </View>
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
  // Sitness .page-head: icon buttons sit edge to edge, their own padding gives the side margin.
  header: { paddingTop: LAYOUT.top, paddingHorizontal: 6, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 0 },
  iconBtn: { width: LAYOUT.iconButton, height: LAYOUT.iconButton, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toolbar: { paddingHorizontal: 20, marginTop: 4 },
  smallBtn: { width: 48, height: 36, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
