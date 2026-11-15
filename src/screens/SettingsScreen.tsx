import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '../components/Typography';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme, ACCENT_OPTIONS } from '../theme/ThemeContext';
import { TYPE } from '../theme/tokens';
import { useTabBarSpace } from '../components/TabBar';
import { CAN_SCALE, SCALE_CHOICES } from '../theme/scale';
import { ListItem, ListSection, OptionSheet, Switch, TonalButton } from '../components/Controls';
import { getAllSongs } from '../db/Database';
import { exportLibrary, importLibrary } from '../utils/exportImport';
import ScreenHeader from '../components/ScreenHeader';
import { FONT_CHOICES } from '../theme/fonts';
import { confirmThen, notify } from '../utils/notify';
import { isSignedIn, isSyncConfigured, NotSignedInError, signOut } from '../sync/googleAuth';
import { getLastSyncedAt, getLastSyncError, syncNow } from '../sync/syncService';

/** "just now", "5 minutes ago", "2 hours ago", or the date for anything older than a day. */
function ago(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `on ${new Date(time).toLocaleDateString()}`;
}

type Sheet = null | 'accent' | 'theme' | 'font' | 'scale';

const THEME_CHOICES = [
  { label: 'Follow system', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export default function SettingsScreen() {
  const { colors, settings, updateSettings, resetSettings } = useTheme();
  const tabSpace = useTabBarSpace();
  const navigation = useNavigation<any>();
  const [songCount, setSongCount] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncConfigured = isSyncConfigured();

  useFocusEffect(
    useCallback(() => {
      getAllSongs().then((s) => setSongCount(s.length));
      isSignedIn().then(setSignedIn);
      getLastSyncedAt().then(setLastSynced);
      getLastSyncError().then(setSyncError);
    }, [])
  );

  const onSync = async () => {
    setSyncing(true);
    try {
      const count = await syncNow(true);
      setSongCount(count);
      setSignedIn(true);
      setLastSynced(await getLastSyncedAt());
      setSyncError(null);
    } catch (e: any) {
      setSyncError(await getLastSyncError());
      // Closing the Google sign-in screen is not an error worth a dialog.
      if (!(e instanceof NotSignedInError)) notify('Sync failed', e?.message || 'Something went wrong.');
    } finally {
      setSyncing(false);
    }
  };

  const onSignOut = () =>
    confirmThen('Sign out of Google?', 'Your songs stay on this device and in your Drive backup. Syncing stops until you sign in again.', 'Sign out', async () => {
      await signOut();
      setSignedIn(false);
    });

  const syncDescription = !syncConfigured
    ? 'Not set up in this build. Add your Google client ID to .env.local and rebuild: see SYNC_SETUP.md.'
    : syncError
      ? `The last sync failed: ${syncError} Tap Sync now to try again.${lastSynced ? ` Last successful sync ${ago(lastSynced)}.` : ''}`
      : lastSynced
        ? `Synced ${ago(lastSynced)}.`
        : 'Keeps a copy of your songs in a hidden Drive folder and syncs it between your devices.';

  const onExport = async () => {
    try {
      await exportLibrary();
    } catch (e: any) {
      notify('Export failed', e?.message || 'Something went wrong.');
    }
  };

  const onImport = async () => {
    try {
      const result = await importLibrary();
      if (result) {
        notify('Import complete', `${result.imported} added, ${result.skipped} skipped (already in your library).`);
      }
    } catch (e: any) {
      notify('Import failed', e?.message || 'Something went wrong.');
    }
  };

  const themeLabel = (THEME_CHOICES.find((c) => c.value === settings.theme) ?? THEME_CHOICES[0]).label;
  const fontLabel = (FONT_CHOICES.find((c) => c.value === settings.font) ?? FONT_CHOICES[0]).label;
  const accentLabel = (ACCENT_OPTIONS.find((o) => o.value === settings.accentColor) ?? ACCENT_OPTIONS[0]).label;
  const scaleLabel = (SCALE_CHOICES.find((c) => c.value === settings.uiScale) ?? SCALE_CHOICES[1]).label;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScreenHeader title="Settings" />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: tabSpace + 12, gap: 12 }}>

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
        <ListItem
          title="Keep the screen awake"
          description="While a song is open, so it doesn't dim mid-song."
          extra={<Switch value={settings.keepAwake} onChange={(v) => updateSettings({ keepAwake: v })} />}
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
        <ListItem title="Theme" extra={themeLabel} onPress={() => setSheet('theme')} />
        {CAN_SCALE && (
          <ListItem
            title="Interface size"
            description="Makes everything larger or smaller. Automatic follows the size of the window, so a big screen gets a bigger interface."
            extra={scaleLabel}
            onPress={() => setSheet('scale')}
          />
        )}
        <ListItem
          title="Font"
          description="The typeface used everywhere. Fonts come from your device, so they may look slightly different on other devices."
          extra={fontLabel}
          onPress={() => setSheet('font')}
        />
      </ListSection>

      <ListSection header="Tools">
        <ListItem
          title="Metronome"
          description="Keeps ticking while you read a song."
          onPress={() => navigation.navigate('Tools', { tool: 'metronome' })}
        />
        <ListItem title="Guitar tuner" description="Listens through the microphone." onPress={() => navigation.navigate('Tools', { tool: 'tuner' })} />
      </ListSection>

      <ListSection header="Library">
        <ListItem
          title={`${songCount} ${songCount === 1 ? 'song saved' : 'songs saved'}`}
          description="Paste lyrics from anywhere, then tidy them up in the editor."
        />
      </ListSection>

      <ListSection header="Google Drive">
        <ListItem title={signedIn ? 'Signed in to Google' : 'Sync with Google Drive'} description={syncDescription} />
        {syncConfigured && (
          <View style={{ padding: 12, gap: 8 }}>
            <TonalButton label={syncing ? 'Syncing…' : signedIn ? 'Sync now' : 'Sign in and sync'} onPress={syncing ? () => {} : onSync} />
            {signedIn && <TonalButton label="Sign out" onPress={onSignOut} />}
          </View>
        )}
      </ListSection>

      <ListSection header="Data">
        <View style={{ padding: 12, gap: 8 }}>
          <TonalButton label="Export library" onPress={onExport} />
          <TonalButton label="Import from file" onPress={onImport} />
          <TonalButton
            label="Reset settings"
            onPress={() =>
              confirmThen('Reset all settings?', 'Everything returns to the defaults. Your songs and collections are kept.', 'Reset', resetSettings)
            }
          />
        </View>
      </ListSection>

      <ListSection header="About">
        <ListItem
          title="Songbook 1.0"
          description="Your songs stay on this device. Looking up lyrics and album covers sends the title and artist to LRCLIB, Deezer and MusicBrainz."
        />
      </ListSection>

      <OptionSheet
        visible={sheet === 'theme'}
        title="Theme"
        options={THEME_CHOICES}
        value={settings.theme}
        onPick={(v) => updateSettings({ theme: v as any })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'font'}
        title="Font"
        options={FONT_CHOICES.map((c) => ({ label: c.label, value: c.value }))}
        value={settings.font}
        onPick={(v) => updateSettings({ font: v })}
        onClose={() => setSheet(null)}
      />
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
