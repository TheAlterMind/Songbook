import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { addSong, SongLine } from '../db/Database';
import { errorText, notify } from '../utils/notify';
import { looksLikeChordSheet, parseChordSheet, reconcileChordRows } from '../utils/chords';
import { SearchIcon } from '../components/Icons';

export default function AddScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, radius } = useTheme();

  const [pasteText, setPasteText] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [language, setLanguage] = useState('English');
  const [year, setYear] = useState('');
  const [key, setKey] = useState('');
  // Chord rows by line index, kept in step with the lyrics as they are edited (as in Edit).
  const [chordRows, setChordRows] = useState<Record<number, string>>({});
  const [importedFrom, setImportedFrom] = useState('');
  const prevLinesRef = useRef<string[]>([]);

  const loadLines = (lines: SongLine[]) => {
    const texts = lines.map((l) => l.text);
    const rows: Record<number, string> = {};
    lines.forEach((l, i) => {
      if (l.chord) rows[i] = l.chord;
    });
    prevLinesRef.current = texts;
    setChordRows(rows);
    setPasteText(texts.join('\n'));
  };

  const onPasteChange = (text: string) => {
    const newLines = text.split('\n');
    setChordRows((prev) => reconcileChordRows(prevLinesRef.current, newLines, prev));
    prevLinesRef.current = newLines;
    setPasteText(text);
  };

  useEffect(() => {
    const p: any = route.params || {};
    if (p.prefillLines) loadLines(p.prefillLines);
    else if (p.prefillLyrics) loadLines(p.prefillLyrics.split('\n').map((text: string) => ({ text, chord: '' })));
    if (p.prefillAlbum) setAlbum(p.prefillAlbum);
    if (p.prefillKey) setKey(p.prefillKey);
    setImportedFrom(p.importedFrom || '');
    if (p.prefillTitle) setTitle(p.prefillTitle);
    if (p.prefillArtist) setArtist(p.prefillArtist);
  }, [route.params]);

  const onCancel = () => navigation.goBack();

  const onSave = async () => {
    const rawLines = pasteText.trim() ? pasteText.split('\n') : ['(no lyrics pasted yet)'];
    let id: number;
    try {
      id = await addSong({
      title: title.trim() || 'Untitled',
      artist: artist.trim() || 'Unknown Artist',
      album,
      genre,
      mood,
      language,
      year,
      key,
      favorite: false,
      lines: rawLines.map((text, i) => ({ text, chord: (chordRows[i] || '').trimEnd() })),
    });
    } catch (e) {
      notify('Could not save the song', errorText(e));
      return;
    }
    navigation.replace('Detail', { songId: id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={{ color: colors.accent }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontWeight: '500' }}>Add song</Text>
        <TouchableOpacity onPress={onSave}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Save</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: TYPE.small, color: colors.neutral500 }}>Paste lyrics</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('WebSearch', { query: [artist, title].filter(Boolean).join(' ') })}
            style={{
              borderWidth: 1,
              borderColor: colors.accent,
              borderRadius: radius.md,
              paddingVertical: 5,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SearchIcon color={colors.accent} size={ICON.small} strokeWidth={2} />
            <Text style={{ color: colors.accent, fontSize: TYPE.small }}>Find lyrics</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={pasteText}
          onChangeText={onPasteChange}
          multiline
          placeholder="Paste lyrics copied from a search result…"
          placeholderTextColor={colors.neutral500}
          style={[inputStyle(colors, radius), { minHeight: 150, textAlignVertical: 'top' }]}
        />
        {(() => {
          const chorded = Object.values(chordRows).filter((c) => c.trim()).length;
          const notes = [importedFrom && `From ${importedFrom}`, chorded > 0 && `chords on ${chorded} ${chorded === 1 ? 'line' : 'lines'}, kept as you edit`]
            .filter(Boolean)
            .join(' · ');
          const canSplit = chorded === 0 && looksLikeChordSheet(pasteText);
          if (!notes && !canSplit) return null;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: TYPE.small, color: colors.neutral500 }}>
                {notes || 'This looks like a chord sheet.'}
              </Text>
              {canSplit && (
                <TouchableOpacity
                  onPress={() => loadLines(parseChordSheet(pasteText))}
                  style={{ backgroundColor: colors.well, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 12 }}
                >
                  <Text style={{ fontSize: TYPE.small, color: colors.text }}>Split chords</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
        <Divider colors={colors} />
        <Field label="Title" colors={colors}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Song title"
            placeholderTextColor={colors.neutral500}
            style={inputStyle(colors, radius)}
          />
        </Field>
        <TwoUp>
          <Field label="Artist" colors={colors}>
            <TextInput value={artist} onChangeText={setArtist} placeholderTextColor={colors.neutral500} style={inputStyle(colors, radius)} />
          </Field>
          <Field label="Album" colors={colors}>
            <TextInput value={album} onChangeText={setAlbum} placeholderTextColor={colors.neutral500} style={inputStyle(colors, radius)} />
          </Field>
        </TwoUp>
        <TwoUp>
          <Field label="Genre" colors={colors}>
            <TextInput value={genre} onChangeText={setGenre} placeholderTextColor={colors.neutral500} style={inputStyle(colors, radius)} />
          </Field>
          <Field label="Mood" colors={colors}>
            <TextInput value={mood} onChangeText={setMood} placeholderTextColor={colors.neutral500} style={inputStyle(colors, radius)} />
          </Field>
        </TwoUp>
        <TwoUp>
          <Field label="Language" colors={colors}>
            <TextInput value={language} onChangeText={setLanguage} placeholderTextColor={colors.neutral500} style={inputStyle(colors, radius)} />
          </Field>
          <Field label="Year" colors={colors}>
            <TextInput
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              placeholderTextColor={colors.neutral500}
              style={inputStyle(colors, radius)}
            />
          </Field>
        </TwoUp>
        <Field label="Key" colors={colors}>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder="e.g. G, Am"
            placeholderTextColor={colors.neutral500}
            style={inputStyle(colors, radius)}
          />
        </Field>
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
});
