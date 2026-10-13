import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, ACCENT_OPTIONS } from '../theme/ThemeContext';
import { getAllSongs } from '../db/Database';
import { exportLibrary, importLibrary } from '../utils/exportImport';

export default function SettingsScreen() {
  const { colors, radius, settings, updateSettings } = useTheme();
  const [songCount, setSongCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getAllSongs().then((s) => setSongCount(s.length));
    }, [])
  );

  const onExport = async () => {
    try {
      await exportLibrary();
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Something went wrong.');
    }
  };

  const onImport = async () => {
    try {
      const result = await importLibrary();
      if (result) {
        setSongCount((await getAllSongs()).length);
        Alert.alert('Import complete', `${result.imported} added, ${result.skipped} skipped (already in your library).`);
      }
    } catch (e: any) {
      Alert.alert('Import failed', e?.message || 'Something went wrong.');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingTop: 54, gap: 18 }}>
      <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text }}>Settings</Text>

      <Section title="Reading" colors={colors}>
        <Card colors={colors} radius={radius}>
          <Row>
            <Text style={{ fontSize: 16, color: colors.text }}>Default text size</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <StepBtn onPress={() => updateSettings({ defaultFontSize: Math.max(16, settings.defaultFontSize - 1) })} colors={colors}>
                −
              </StepBtn>
              <Text style={{ fontSize: 15, color: colors.neutral500, width: 20, textAlign: 'center' }}>
                {settings.defaultFontSize}
              </Text>
              <StepBtn onPress={() => updateSettings({ defaultFontSize: Math.min(26, settings.defaultFontSize + 1) })} colors={colors}>
                +
              </StepBtn>
            </View>
          </Row>
          <Divider colors={colors} />
          <Row>
            <Text style={{ fontSize: 16, color: colors.text }}>Show chords by default</Text>
            <Toggle value={settings.defaultChordsOn} onToggle={() => updateSettings({ defaultChordsOn: !settings.defaultChordsOn })} colors={colors} />
          </Row>
        </Card>
      </Section>

      <Section title="Appearance" colors={colors}>
        <Card colors={colors} radius={radius}>
          <Text style={{ fontSize: 16, color: colors.text, marginBottom: 8 }}>Accent color</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {ACCENT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => updateSettings({ accentColor: opt.value })}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: opt.value,
                  borderWidth: 2,
                  borderColor: opt.value === settings.accentColor ? colors.text : 'transparent',
                }}
              />
            ))}
          </View>
          <Divider colors={colors} />
          <Row>
            <Text style={{ fontSize: 16, color: colors.text }}>Light version</Text>
            <Toggle value={settings.lightMode} onToggle={() => updateSettings({ lightMode: !settings.lightMode })} colors={colors} />
          </Row>
        </Card>
      </Section>

      <Section title="Library" colors={colors}>
        <Card colors={colors} radius={radius}>
          <Text style={{ fontSize: 16, color: colors.text }}>
            {songCount} {songCount === 1 ? 'song saved' : 'songs saved'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.neutral500, marginTop: 2 }}>
            Paste lyrics from anywhere, then tidy them up in the editor.
          </Text>
        </Card>
      </Section>

      <Section title="Data" colors={colors}>
        <TouchableOpacity onPress={onExport} style={[styles.blockBtn, { borderColor: colors.divider }]}>
          <Text style={{ color: colors.text }}>Export library</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onImport} style={[styles.blockBtn, { borderColor: colors.divider, marginTop: 8 }]}>
          <Text style={{ color: colors.text }}>Import from file</Text>
        </TouchableOpacity>
      </Section>
    </ScrollView>
  );
}

function Section({ title, colors, children }: any) {
  return (
    <View>
      <Text style={{ color: colors.neutral500, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
function Card({ colors, radius, children }: any) {
  return <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 14 }}>{children}</View>;
}
function Row({ children }: any) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>{children}</View>;
}
function Divider({ colors }: any) {
  return <View style={{ height: 1, backgroundColor: colors.divider }} />;
}
function StepBtn({ onPress, colors, children }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: colors.text }}>{children}</Text>
    </TouchableOpacity>
  );
}
function Toggle({ value, onToggle, colors }: any) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: value ? colors.accent : colors.neutral700, padding: 3, justifyContent: 'center' }}
    >
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  blockBtn: { borderWidth: 1, borderRadius: 8, padding: 12, alignItems: 'center' },
});
