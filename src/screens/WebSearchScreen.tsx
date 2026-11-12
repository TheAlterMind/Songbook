import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { BackChevronIcon } from '../components/Icons';

// If Google's results don't load well inside the WebView, swap this for:
// https://duckduckgo.com/html/?q=  or  https://www.bing.com/search?q=
const SEARCH_ENGINE_BASE = 'https://www.google.com/search?q=';

export default function WebSearchScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius } = useTheme();
  const [q, setQ] = useState('');

  const go = () => {
    if (!q.trim()) return;
    const url = `${SEARCH_ENGINE_BASE}${encodeURIComponent(q + ' lyrics')}`;
    navigation.navigate('Browser', { url, query: q });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: LAYOUT.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6, marginRight: 4 }}>
          <BackChevronIcon color={colors.text} size={ICON.button} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPE.title, fontWeight: '500', color: colors.text }}>Search the web</Text>
      </View>
      <Text style={{ fontSize: TYPE.small, color: colors.neutral500, marginBottom: 6 }}>Song title / artist</Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={go}
        autoFocus
        placeholder="e.g. Fleetwood Mac Landslide"
        placeholderTextColor={colors.neutral500}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.divider,
          borderRadius: radius.md,
          padding: 12,
          color: colors.text,
          marginBottom: 16,
        }}
      />
      <TouchableOpacity onPress={go} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: 14, alignItems: 'center' }}>
        <Text style={{ color: colors.accent100, fontWeight: '500' }}>Search</Text>
      </TouchableOpacity>
      <Text style={{ marginTop: 20, color: colors.neutral500, fontSize: TYPE.label, lineHeight: 18 }}>
        This opens a normal in-app browser. Find a lyrics page you trust, select the text yourself, copy it, then come back
        and tap "Save from clipboard."
      </Text>
    </View>
  );
}
