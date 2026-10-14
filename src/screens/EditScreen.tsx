import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getSong, updateSong, Song, SongLine } from '../db/Database';
import { transposeKey, transposeSongLine } from '../utils/transpose';
import { SortDownIcon, SortUpIcon, StarIcon } from '../components/Icons';
import { lineHasChords, reconcileSongLines } from '../utils/arrangement';
import SongArrangement from '../components/SongArrangement';
import SongMetadataPanel from '../components/SongMetadataPanel';
import { editedMetadata, importedMetadataFields } from '../utils/editorMetadata';

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
  const [arrangement, setArrangement] = useState<SongLine[]>([]);
  const [chordsCleared, setChordsCleared] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);

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
      setYear(s.year ?? importedMetadataFields(s.metadata).year);
      setKey(s.key || s.metadata?.key || '');
      setFavoriteLocal(!!s.favorite);
      const initialLines = s.lines.map((l) => l.text);
      setLyricsText(initialLines.join('\n'));
      setArrangement(s.lines);
    });
  }, [songId]);

  if (!loadedSong) return null;

  const handleLyricsChange = (newText: string) => {
    const next = reconcileSongLines(arrangement, newText);
    if (arrangement.filter(lineHasChords).length > next.filter(lineHasChords).length) setChordsCleared(true);
    setArrangement(next);
    setLyricsText(newText);
  };

  const toggleChordRow = (idx: number) => {
    setArrangement((prev) => prev.map((line, i) => i === idx
      ? line.chord !== undefined || line.chords?.length ? { text: line.text } : { text: line.text, chord: '' }
      : line));
  };
  const updateChordRow = (idx: number, val: string) => {
    setArrangement((prev) => prev.map((line, i) => i === idx ? { text: line.text, chord: val } : line));
  };
  const updateAnchor = (lineIndex: number, anchorIndex: number, symbol: string) => {
    setArrangement((prev) => prev.map((line, i) => i === lineIndex ? {
      ...line, chords: line.chords?.map((anchor, a) => a === anchorIndex ? { ...anchor, symbol } : anchor),
    } : line));
  };
  const transpose = (steps: number) => {
    setArrangement((prev) => prev.map((line) => transposeSongLine(line, steps)));
    if (key.trim()) setKey(transposeKey(key, steps));
  };

  const onSave = async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true; setSaving(true); setSaveError('');
    const newLines = arrangement.map((line) => ({ ...line,
      ...(line.chords ? { chords: line.chords.filter((anchor) => anchor.symbol.trim()).map((anchor) => ({ ...anchor, symbol: anchor.symbol.trim() })) } : {}),
    }));
    try { await updateSong({
      ...loadedSong,
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
      metadata: editedMetadata(loadedSong.metadata, { key, album, genre, language, year }),
      lyricsSource: loadedSong.lyricsSource ? {
        ...loadedSong.lyricsSource,
        modifiedSinceImport: loadedSong.lyricsSource.modifiedSinceImport ||
          JSON.stringify(newLines) !== JSON.stringify(loadedSong.lines),
      } : undefined,
    });
    navigation.goBack();
    } catch { setSaveError('Could not save the song. Your changes are still here; please try again.'); }
    finally { saveInFlight.current = false; setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity disabled={saving} onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.accent }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontWeight: '600' }}>Edit song</Text>
        <TouchableOpacity disabled={saving} onPress={onSave} accessibilityRole="button" accessibilityLabel="Save song">
          <Text style={{ color: colors.accent, fontWeight: '600' }}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView pointerEvents={saving ? 'none' : 'auto'} contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
          {!!saveError && <Text accessibilityRole="alert" style={{ color: colors.text }}>{saveError}</Text>}
          <Field label="Lyrics" colors={colors}>
            <TextInput
              value={lyricsText}
              accessibilityLabel="Lyrics" testID="edit-lyrics-input"
              onChangeText={handleLyricsChange}
              multiline
              placeholder="Paste or type the full lyrics…"
              placeholderTextColor={colors.neutral500}
              style={[inputStyle(colors, radius), { minHeight: 160, textAlignVertical: 'top' }]}
            />
          </Field>
          {chordsCleared && <Text accessibilityRole="alert" style={{ color: colors.neutral500, fontSize: 13 }}>Chords were removed from edited lyric lines. Unchanged lines retain their chords.</Text>}

          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ color: colors.neutral500, fontSize: 14, textTransform: 'uppercase' }}>Chords (optional)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 13, color: colors.neutral500 }}>Transpose</Text>
                <TouchableOpacity onPress={() => transpose(-1)} accessibilityRole="button" accessibilityLabel="Transpose down one semitone" style={[styles.tinyBtn, { borderColor: colors.divider }]}>
                  <SortDownIcon color={colors.text} size={10} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => transpose(1)} accessibilityRole="button" accessibilityLabel="Transpose up one semitone" style={[styles.tinyBtn, { borderColor: colors.divider }]}>
                  <SortUpIcon color={colors.text} size={10} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: colors.neutral500, marginBottom: 8 }}>
              Imported chords stay attached to their words. Edit each chord below, or add a spaced chord row. Editing a lyric line clears its chords so they cannot drift onto different words.
            </Text>
            {arrangement.map((line, idx) => {
              const text = line.text;
              if (!text.trim() && !lineHasChords(line)) return null;
              const has = line.chord !== undefined || !!line.chords?.length;
              return (
                <View key={idx} style={{ marginBottom: 6 }}>
                  {!!line.chords?.length && <>
                    <SongArrangement lines={[line]} fontSize={15} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {line.chords.map((anchor, anchorIndex) => <TextInput key={anchorIndex} value={anchor.symbol}
                        onChangeText={(symbol) => updateAnchor(idx, anchorIndex, symbol)} maxLength={64} autoCorrect={false} autoCapitalize="none"
                        accessibilityLabel={`Chord ${anchorIndex + 1} on line ${idx + 1}`} style={{ minWidth: 52, color: colors.accent, borderWidth: 1, borderColor: colors.divider, borderRadius: 5, padding: 6 }} />)}
                    </View>
                  </>}
                  {line.chord !== undefined && (
                    <TextInput
                      value={line.chord}
                      onChangeText={(v) => updateChordRow(idx, v)}
                      placeholder="  G      D"
                      placeholderTextColor={colors.neutral500}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 15,
                        padding: 4,
                        borderWidth: 1,
                        borderColor: colors.divider,
                        borderRadius: 4,
                        color: colors.accent,
                        marginBottom: 2,
                      }}
                    />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: 'monospace', fontSize: 15, color: colors.text, flex: 1 }}>{line.chords?.length ? `Line ${idx + 1}` : text}</Text>
                    <TouchableOpacity onPress={() => toggleChordRow(idx)}>
                      <Text style={{ fontSize: 12, color: colors.accent }}>{has ? 'Remove chord' : '+ Chord'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
          <SongMetadataPanel metadata={editedMetadata(loadedSong.metadata, { key, album, genre, language, year })} sourceDetails={loadedSong.sourceDetails} />

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
            <StarIcon color={favorite ? colors.accent : colors.neutral500} filled={favorite} size={14} />
            <Text style={{ fontSize: 15, color: colors.text }}>Favorite</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, colors, children }: any) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 14, color: colors.neutral500 }}>{label}</Text>
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
  return { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: 10, color: colors.text, fontSize: 16 };
}

const styles = StyleSheet.create({
  header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  tinyBtn: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
