import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { getSong, updateSong, Song } from '../db/Database';
import { errorText, notify } from '../utils/notify';
import { transposeLine } from '../utils/transpose';
import { reconcileChordRows } from '../utils/chords';
import { SortDownIcon, SortUpIcon, StarIcon } from '../components/Icons';

export default function EditScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { songId } = route.params;
  const { colors, radius } = useTheme();

  const [loadedSong, setLoadedSong] = useState<Song | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [language, setLanguage] = useState('');
  const [year, setYear] = useState('');
  const [key, setKey] = useState('');
  const [favorite, setFavoriteLocal] = useState(false);
  const [lyricsText, setLyricsText] = useState('');
  const [chordRows, setChordRows] = useState<Record<number, string>>({});
  const prevLinesRef = useRef<string[]>([]);

  useEffect(() => {
    getSong(songId).then((s) => {
      if (!s) return;
      setLoadedSong(s);
      setTitle(s.title);
      setArtist(s.artist);
      setAlbum(s.album || '');
      setGenre(s.genre || '');
      setMood(s.mood || '');
      setLanguage(s.language || '');
      setYear(s.year || '');
      setKey(s.key || '');
      setFavoriteLocal(!!s.favorite);
      const initialLines = s.lines.map((l) => l.text);
      setLyricsText(initialLines.join('\n'));
      prevLinesRef.current = initialLines;
      const rows: Record<number, string> = {};
      s.lines.forEach((l, i) => {
        if (l.chord) rows[i] = l.chord;
      });
      setChordRows(rows);
    });
  }, [songId]);

  if (!loadedSong) return null;

  const lines = lyricsText.split('\n');

  const handleLyricsChange = (newText: string) => {
    const newLines = newText.split('\n');
    setChordRows((prev) => reconcileChordRows(prevLinesRef.current, newLines, prev));
    prevLinesRef.current = newLines;
    setLyricsText(newText);
  };

  const toggleChordRow = (idx: number) => {
    setChordRows((prev) => {
      const next = { ...prev };
      if (idx in next) delete next[idx];
      else next[idx] = '';
      return next;
    });
  };
  const updateChordRow = (idx: number, val: string) => {
    setChordRows((prev) => ({ ...prev, [idx]: val }));
  };
  const transpose = (steps: number) => {
    setChordRows((prev) => {
      const next: Record<number, string> = {};
      Object.keys(prev).forEach((k) => {
        next[Number(k)] = transposeLine(prev[Number(k)], steps);
      });
      return next;
    });
  };

  const onSave = async () => {
    const newLines = lines.map((text, i) => ({ text, chord: (chordRows[i] || '').trimEnd() }));
    try {
      await updateSong({
      id: songId,
      title: title.trim() || 'Untitled',
      artist: artist.trim() || 'Unknown Artist',
      album,
      genre,
      mood,
      language,
      year,
      key,
      favorite,
      lines: newLines,
    });
    } catch (e) {
      notify('Could not save your changes', errorText(e));
      return;
    }
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: TYPE.title, color: colors.accent }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: TYPE.title, color: colors.text, fontWeight: '500' }}>Edit song</Text>
        <TouchableOpacity onPress={onSave}>
          <Text style={{ fontSize: TYPE.title, color: colors.accent }}>Save</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
          <Field label="Lyrics" colors={colors}>
            <TextInput
              value={lyricsText}
              onChangeText={handleLyricsChange}
              multiline
              placeholder="Paste or type the full lyrics…"
              placeholderTextColor={colors.neutral500}
              style={[inputStyle(colors, radius), { minHeight: 160, textAlignVertical: 'top' }]}
            />
          </Field>

          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ color: colors.neutral500, fontSize: TYPE.label }}>Chords (optional)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: TYPE.tiny, color: colors.neutral500 }}>Transpose</Text>
                <TouchableOpacity onPress={() => transpose(-1)} style={[styles.tinyBtn, { borderColor: colors.divider }]}>
                  <SortDownIcon color={colors.text} size={10} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => transpose(1)} style={[styles.tinyBtn, { borderColor: colors.divider }]}>
                  <SortUpIcon color={colors.text} size={10} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={{ fontSize: TYPE.tiny, color: colors.neutral500, marginBottom: 8 }}>
              Add a chord row above any line, then use spaces to place it over a word. Chords stay attached to
              their own line even if you insert or remove lines above them.
            </Text>
            {lines.map((text, idx) => {
              if (!text.trim()) return null;
              const has = idx in chordRows;
              return (
                <View key={idx} style={{ marginBottom: 6 }}>
                  {has && (
                    <TextInput
                      value={chordRows[idx]}
                      onChangeText={(v) => updateChordRow(idx, v)}
                      placeholder="  G      D"
                      placeholderTextColor={colors.neutral500}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: TYPE.label,
                        padding: 4,
                        borderWidth: 1,
                        borderColor: colors.divider,
                        borderRadius: radius.md,
                        color: colors.accent,
                        marginBottom: 2,
                      }}
                    />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: 'monospace', fontSize: TYPE.label, color: colors.text, flex: 1 }}>{text}</Text>
                    <TouchableOpacity onPress={() => toggleChordRow(idx)}>
                      <Text style={{ fontSize: TYPE.tiny, color: colors.accent }}>{has ? 'Remove chord' : '+ Chord'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <Divider colors={colors} />
          <Field label="Title" colors={colors}>
            <TextInput value={title} onChangeText={setTitle} style={inputStyle(colors, radius)} placeholderTextColor={colors.neutral500} />
          </Field>
          <TwoUp>
            <Field label="Artist" colors={colors}>
              <TextInput value={artist} onChangeText={setArtist} style={inputStyle(colors, radius)} placeholderTextColor={colors.neutral500} />
            </Field>
            <Field label="Album" colors={colors}>
              <TextInput value={album} onChangeText={setAlbum} style={inputStyle(colors, radius)} placeholderTextColor={colors.neutral500} />
            </Field>
          </TwoUp>
          <TwoUp>
            <Field label="Genre" colors={colors}>
              <TextInput value={genre} onChangeText={setGenre} style={inputStyle(colors, radius)} placeholderTextColor={colors.neutral500} />
            </Field>
            <Field label="Mood" colors={colors}>
              <TextInput value={mood} onChangeText={setMood} style={inputStyle(colors, radius)} placeholderTextColor={colors.neutral500} />
            </Field>
          </TwoUp>
          <TwoUp>
            <Field label="Language" colors={colors}>
              <TextInput value={language} onChangeText={setLanguage} style={inputStyle(colors, radius)} placeholderTextColor={colors.neutral500} />
            </Field>
            <Field label="Year" colors={colors}>
              <TextInput
                value={year}
                onChangeText={setYear}
                style={inputStyle(colors, radius)}
                placeholderTextColor={colors.neutral500}
                keyboardType="number-pad"
              />
            </Field>
          </TwoUp>
          <Field label="Key" colors={colors}>
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder="e.g. G, Am"
              style={inputStyle(colors, radius)}
              placeholderTextColor={colors.neutral500}
            />
          </Field>

          <TouchableOpacity
            onPress={() => setFavoriteLocal((v) => !v)}
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: colors.divider,
              borderRadius: radius.md,
              paddingVertical: 6,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <StarIcon color={favorite ? colors.accent : colors.neutral500} filled={favorite} size={ICON.inline} />
            <Text style={{ fontSize: TYPE.label, color: colors.text }}>Favorite</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, colors, children }: any) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>{label}</Text>
      {children}
    </View>
  );
}
function TwoUp({ children }: any) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {React.Children.map(children, (c) => (
        <View style={{ flex: 1 }}>{c}</View>
      ))}
    </View>
  );
}
function Divider({ colors }: any) {
  return <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 4 }} />;
}
function inputStyle(colors: any, radius: any) {
  return { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: 10, color: colors.text, fontSize: TYPE.body };
}

const styles = StyleSheet.create({
  header: { paddingTop: LAYOUT.top, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  tinyBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
