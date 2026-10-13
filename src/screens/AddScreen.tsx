import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { addSong, type LyricsProvenance } from '../db/Database';
import { SearchIcon } from '../components/Icons';
import type { RootStackParamList } from '../types';
import { PROVIDERS } from '../lyrics';

export default function AddScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Add'>) {
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
  const [lyricsSource, setLyricsSource] = useState<LyricsProvenance | undefined>();
  const [importedLyrics, setImportedLyrics] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedSongId, setSavedSongId] = useState<number | null>(null);
  const saveInFlight = useRef(false);
  const appliedImport = useRef<string | null>(null);

  // Finish the single local write before allowing this editor to leave the stack.
  usePreventRemove(saving, () => {});

  useEffect(() => {
    const p = route.params;
    const draft = p?.lyricsImport;
    if (draft && draft.importId !== appliedImport.current) {
      appliedImport.current = draft.importId;
      const text = draft.plainLyrics.replace(/\r\n?/g, '\n');
      setPasteText(text);
      setImportedLyrics(text);
      setTitle(draft.title);
      setArtist(draft.artist);
      setAlbum((current) => current.trim() ? current : draft.album ?? '');
      setLyricsSource(draft.lyricsSource);
      setSaveError('');
      return;
    }
    if (!draft) {
      if (p?.prefillLyrics !== undefined) setPasteText(p.prefillLyrics.replace(/\r\n?/g, '\n'));
      if (p?.prefillTitle !== undefined) setTitle(p.prefillTitle);
      if (p?.prefillArtist !== undefined) setArtist(p.prefillArtist);
    }
  }, [route.params]);

  useEffect(() => {
    if (savedSongId !== null && !saving) navigation.replace('Detail', { songId: savedSongId });
  }, [savedSongId, saving, navigation]);

  const onCancel = () => { if (!saveInFlight.current) navigation.goBack(); };

  const onSave = async () => {
    if (saveInFlight.current || savedSongId !== null) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError('');
    const normalizedLyrics = pasteText.replace(/\r\n?/g, '\n');
    const rawLines = normalizedLyrics.trim() ? normalizedLyrics.split('\n') : ['(no lyrics pasted yet)'];
    try {
      const id = await addSong({
        title: title.trim() || 'Untitled',
        artist: artist.trim() || 'Unknown Artist',
        album, genre, mood, language, year, key,
        favorite: false,
        lines: rawLines.map((text) => ({ text, chord: '' })),
        ...(lyricsSource ? { lyricsSource: {
          ...lyricsSource,
          modifiedSinceImport: !!lyricsSource.modifiedSinceImport || (importedLyrics !== null && normalizedLyrics !== importedLyrics),
        } } : {}),
      });
      setSavedSongId(id);
    } catch {
      saveInFlight.current = false;
      setSaveError('The song could not be saved. Your draft is still here; please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} disabled={saving} accessibilityRole="button" accessibilityLabel="Cancel add song">
          <Text style={{ color: colors.accent }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontWeight: '600' }}>Add song</Text>
        <TouchableOpacity onPress={onSave} disabled={saving || savedSongId !== null} accessibilityRole="button" accessibilityLabel="Save song" testID="song-save">
          <Text style={{ color: colors.accent, fontWeight: '600' }}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView pointerEvents={saving ? 'none' : 'auto'} contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
        {!!saveError && <Text accessibilityRole="alert" style={{ color: colors.text, lineHeight: 22 }}>{saveError}</Text>}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.neutral500 }}>Lyrics</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('WebSearch', { query: [title, artist].filter(Boolean).join(' '), returnToAdd: true })}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Find lyrics"
            testID="find-lyrics"
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
            <SearchIcon color={colors.accent} size={12} strokeWidth={2} />
            <Text style={{ color: colors.accent, fontSize: 14 }}>Find lyrics</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={pasteText}
          onChangeText={setPasteText}
          editable={!saving}
          accessibilityLabel="Lyrics"
          testID="song-lyrics-input"
          multiline
          placeholder="Find lyrics above, or paste your own\u2026"
          placeholderTextColor={colors.neutral500}
          style={[inputStyle(colors, radius), { minHeight: 150, textAlignVertical: 'top' }]}
        />
        {lyricsSource && <View style={{ gap: 4 }}>
          <Text style={{ color: colors.neutral500, fontSize: 13 }}>Imported from {PROVIDERS.find((provider) => provider.id === lyricsSource.provider)?.name ?? lyricsSource.provider}</Text>
          {!!lyricsSource.attribution && <Text style={{ color: colors.neutral500, fontSize: 13 }}>{lyricsSource.attribution.text || `Lyrics supplied by ${lyricsSource.attribution.name}`}</Text>}
        </View>}
        <Divider colors={colors} />
        <Field label="Title" colors={colors}>
          <TextInput
            value={title}
            accessibilityLabel="Song title"
            testID="song-title-input"
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
});
