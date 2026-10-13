import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getSong, setFavorite, Song } from '../db/Database';
import { BackChevronIcon, CollectionsTabIcon, StarIcon, EditPencilIcon } from '../components/Icons';
import SongArrangement from '../components/SongArrangement';
import SongMetadataPanel, { providerLabel } from '../components/SongMetadataPanel';
import { lineHasChords } from '../utils/arrangement';

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

  const hasChords = song.lines.some(lineHasChords);

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
          <BackChevronIcon color={colors.text} size={18} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
          <Text style={{ fontSize: 21, fontWeight: '600', color: colors.text }} numberOfLines={1}>
            {song.title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('AddToCollection', { songId })}
          style={styles.iconBtn}
        >
          <CollectionsTabIcon color={colors.accent} size={18} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleFav} style={styles.iconBtn}>
          <StarIcon color={song.favorite ? colors.accent : colors.neutral500} filled={!!song.favorite} size={19} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Edit', { songId })}
          accessibilityRole="button" accessibilityLabel="Edit song"
          style={styles.iconBtn}
        >
          <EditPencilIcon color={colors.accent} size={18} />
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => setFontSize((f) => Math.max(16, f - 1))}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.smallBtn, { flex: 1, borderColor: colors.divider }]}
          >
            <Text style={{ color: colors.accent, fontSize: 14 }}>A−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFontSize((f) => Math.min(30, f + 1))}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.smallBtn, { flex: 1, borderColor: colors.divider }]}
          >
            <Text style={{ color: colors.accent, fontSize: 17 }}>A+</Text>
          </TouchableOpacity>
        </View>
        {hasChords && (
          <TouchableOpacity
            onPress={() => setChordsOn((v) => !v)}
            accessibilityRole="switch" accessibilityLabel="Show chords" accessibilityState={{ checked: chordsOn }}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: chordsOn ? colors.accent : colors.divider,
              backgroundColor: chordsOn ? colors.accent + '22' : 'transparent',
            }}
          >
            <Text style={{ fontSize: 14, color: chordsOn ? colors.accent : colors.neutral500 }}>Chords {chordsOn ? 'On' : 'Off'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={{ color: colors.neutral500, fontSize: 16, marginBottom: 14 }}>{song.artist}</Text>
        <View style={{ marginBottom: 18 }}><SongMetadataPanel metadata={{ ...song.metadata, ...(song.key ? { key: song.key } : {}), ...(song.album ? { album: song.album } : {}) }} sourceDetails={song.sourceDetails} /></View>
        <SongArrangement lines={song.lines} fontSize={fontSize} chordsOn={chordsOn} />
        {song.lyricsSource && (
          <View style={{ marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, gap: 4 }}>
            <Text style={{ color: colors.neutral500, fontSize: 12 }}>
              Imported from {providerLabel(song.lyricsSource.provider)}
              {song.lyricsSource.modifiedSinceImport ? ' · Edited in your library' : ''}
            </Text>
            {!!song.lyricsSource.attribution && (
              <Text style={{ color: colors.neutral500, fontSize: 12 }}>
                {song.lyricsSource.attribution.text || `Lyrics: ${song.lyricsSource.attribution.name}`}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toolbar: { paddingHorizontal: 20, marginTop: 4 },
  smallBtn: { width: 48, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
