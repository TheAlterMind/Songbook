import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Text } from '../components/Typography';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { BackChevronIcon } from '../components/Icons';
import { EXTRACT_SCRIPT, PageImport } from '../services/extract';
import { looksLikeChordSheet, parseChordSheet } from '../utils/chords';

export default function BrowserScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { url, query } = route.params;
  const { colors, radius } = useTheme();
  const web = useRef<WebView>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [busy, setBusy] = useState(false);

  // Guess artist and title from the search, for imports that don't carry their own.
  const guess = () => {
    const parts = String(query || '').split(/ - | – /);
    return parts.length > 1
      ? { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
      : { artist: '', title: String(query || '').trim() };
  };

  const toAdd = (title: string, artist: string, key: string, text: string, chordSheet: boolean, from: string) => {
    const sheet = chordSheet || looksLikeChordSheet(text);
    navigation.popTo('Add', {
      prefillTitle: title || guess().title,
      prefillArtist: artist || guess().artist,
      prefillKey: key,
      ...(sheet ? { prefillLines: parseChordSheet(text) } : { prefillLyrics: text }),
      importedFrom: from,
    });
  };

  const importPage = () => {
    setBusy(true);
    web.current?.injectJavaScript(EXTRACT_SCRIPT);
    // If the page never answers (still loading, scripts blocked), fall back after a moment.
    setTimeout(() => setBusy(false), 4000);
  };

  const onMessage = async (e: WebViewMessageEvent) => {
    setBusy(false);
    let msg: PageImport;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.ok && msg.text) {
      toAdd(msg.title, msg.artist, msg.key, msg.text, msg.chordSheet, msg.source);
      return;
    }
    // Nothing on the page: offer whatever was copied, as before.
    const copied = (await Clipboard.getStringAsync())?.trim();
    const reason = msg.ok ? 'Nothing to import on this page.' : msg.reason;
    if (copied) {
      Alert.alert('Nothing found on the page', `${reason}\n\nUse the text you copied instead?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use copied text', onPress: () => toAdd('', '', '', copied, false, 'clipboard') },
      ]);
    } else {
      Alert.alert('Nothing to import', reason);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.head, { marginTop: LAYOUT.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <BackChevronIcon color={colors.text} size={ICON.button} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: TYPE.label, color: colors.neutral500 }}>
          {pageTitle}
        </Text>
      </View>
      <WebView
        ref={web}
        source={{ uri: url }}
        startInLoadingState
        onMessage={onMessage}
        onNavigationStateChange={(s) => setPageTitle(s.title || '')}
        style={{ backgroundColor: colors.bg }}
      />
      <TouchableOpacity
        onPress={importPage}
        disabled={busy}
        style={[styles.import, { backgroundColor: colors.accent, borderRadius: radius.lg }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.accent100} />
        ) : (
          <Text style={{ color: colors.accent100, fontSize: TYPE.body, fontWeight: '500' }}>Import</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { height: LAYOUT.headerHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 },
  iconBtn: { width: LAYOUT.iconButton, height: LAYOUT.iconButton, alignItems: 'center', justifyContent: 'center' },
  import: { position: 'absolute', bottom: 20, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 32, minWidth: 140, alignItems: 'center', elevation: 4 },
});
