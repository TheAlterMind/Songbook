import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, ACCENT_OPTIONS } from '../theme/ThemeContext';
import { TYPE } from '../theme/tokens';
import { CAN_SCALE, SCALE_CHOICES } from '../theme/scale';
import { ListItem, ListSection, OptionSheet, Switch, TonalButton } from '../components/Controls';
import { getAllSongs } from '../db/Database';
import { exportLibrary, importLibrary } from '../utils/exportImport';
import ScreenHeader from '../components/ScreenHeader';

type Sheet = null | 'accent' | 'scale';

export default function SettingsScreen() {
  const { colors, settings, updateSettings } = useTheme();
  const [songCount, setSongCount] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);

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
        Alert.alert('Import complete', `${result.imported} added, ${result.skipped} skipped (already in your library).`);
      }
    } catch (e: any) {
      Alert.alert('Import failed', e?.message || 'Something went wrong.');
    }
  };

  const accentLabel = (ACCENT_OPTIONS.find((o) => o.value === settings.accentColor) ?? ACCENT_OPTIONS[0]).label;
  const scaleLabel = (SCALE_CHOICES.find((c) => c.value === settings.uiScale) ?? SCALE_CHOICES[1]).label;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScreenHeader title="Settings" />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24, gap: 12 }}>

      <ListSection header="Reading">
        <ListItem
          title="Default text size"
          extra={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StepBtn label="−" onPress={() => updateSettings({ defaultFontSize: Math.max(16, settings.defaultFontSize - 1) })} />
              <Text style={{ fontSize: TYPE.label, color: colors.text, width: 24, textAlign: 'center' }}>
                {settings.defaultFontSize}
              </Text>
              <StepBtn label="+" onPress={() => updateSettings({ defaultFontSize: Math.min(26, settings.defaultFontSize + 1) })} />
            </View>
          }
        />
        <ListItem
          title="Show chords by default"
          extra={<Switch value={settings.defaultChordsOn} onChange={(v) => updateSettings({ defaultChordsOn: v })} />}
        />
      </ListSection>

      <ListSection header="Display">
        <ListItem
          title="Accent color"
          extra={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
              <Text style={{ fontSize: TYPE.label, color: colors.neutral500 }}>{accentLabel}</Text>
            </View>
          }
          onPress={() => setSheet('accent')}
        />
        <ListItem
          title="Light version"
          extra={<Switch value={settings.lightMode} onChange={(v) => updateSettings({ lightMode: v })} />}
        />
        {CAN_SCALE && (
          <ListItem
            title="Interface size"
            description="Makes everything larger or smaller. Automatic follows the size of the window, so a big screen gets a bigger interface."
            extra={scaleLabel}
            onPress={() => setSheet('scale')}
          />
        )}
      </ListSection>

      <ListSection header="Library">
        <ListItem
          title={`${songCount} ${songCount === 1 ? 'song saved' : 'songs saved'}`}
          description="Paste lyrics from anywhere, then tidy them up in the editor."
        />
      </ListSection>

      <ListSection header="Data">
        <View style={{ padding: 12, gap: 8 }}>
          <TonalButton label="Export library" onPress={onExport} />
          <TonalButton label="Import from file" onPress={onImport} />
        </View>
      </ListSection>

      <OptionSheet
        visible={sheet === 'accent'}
        title="Accent color"
        options={ACCENT_OPTIONS.map((o) => ({ label: o.label, value: o.value, swatch: o.value }))}
        value={settings.accentColor}
        onPick={(v) => updateSettings({ accentColor: v })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'scale'}
        title="Interface size"
        options={SCALE_CHOICES}
        value={settings.uiScale}
        onPick={(v) => updateSettings({ uiScale: v })}
        onClose={() => setSheet(null)}
      />
    </ScrollView>
    </View>
  );
}

/** A small round stepper button (Sitness .round, scaled to a list row). */
function StepBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: colors.text, fontSize: TYPE.body }}>{label}</Text>
    </TouchableOpacity>
  );
}
