import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { addSong } from '../db/Database';
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

  useEffect(() => {
    const p: any = route.params || {};
    if (p.prefillLyrics) setPasteText(p.prefillLyrics);
    if (p.prefillTitle) setTitle(p.prefillTitle);
    if (p.prefillArtist) setArtist(p.prefillArtist);
  }, [route.params]);

  const onCancel = () => navigation.goBack();

  const onSave = async () => {
    const lines = pasteText.split('\n').filter((l) => l.trim().length > 0);
    const id = await addSong({
      title: title.trim() || 'Untitled',
      artist: artist.trim() || 'Unknown Artist',
      album,
      genre,
      mood,
      language,
      year,
      key,
      favorite: false,
      lines: (lines.length ? lines : ['(no lyrics pasted yet)']).map((text) => ({ text, chord: '' })),
    });
    navigation.replace('Detail', { songId: id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={{ color: colors.accent }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontWeight: '600' }}>Add song</Text>
        <TouchableOpacity onPress={onSave}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Save</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.neutral500 }}>Paste lyrics</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('WebSearch')}
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
            <Text style={{ color: colors.accent, fontSize: 12 }}>Search the web</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={pasteText}
          onChangeText={setPasteText}
          multiline
          placeholder="Paste lyrics copied from a search result\u2026"
          placeholderTextColor={colors.neutral500}
          style={[inputStyle(colors, radius), { minHeight: 150, textAlignVertical: 'top' }]}
        />
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
    </View>
  );
}

function Field({ label, colors, children }: any) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 12, color: colors.neutral500 }}>{label}</Text>
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
  return { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: 10, color: colors.text, fontSize: 14 };
}

const styles = StyleSheet.create({
  header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
});
