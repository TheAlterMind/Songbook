import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';

export default function BrowserScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { url, query } = route.params;
  const { colors, radius } = useTheme();

  const saveFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    const parts = query.split(/ - | \u2013 /);
    const guessArtist = parts.length > 1 ? parts[0].trim() : '';
    const guessTitle = parts.length > 1 ? parts.slice(1).join(' - ').trim() : query.trim();

    navigation.navigate('Add', {
      prefillTitle: guessTitle,
      prefillArtist: guessArtist,
      prefillLyrics: text ?? '',
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <WebView source={{ uri: url }} startInLoadingState />
      <TouchableOpacity onPress={saveFromClipboard} style={[styles.saveButton, { backgroundColor: colors.accent, borderRadius: radius.lg }]}>
        <Text style={{ color: colors.bg, fontWeight: '600' }}>Save from clipboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  saveButton: { position: 'absolute', bottom: 20, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 22, elevation: 4 },
});
