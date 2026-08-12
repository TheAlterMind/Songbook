import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
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
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 54 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6, marginRight: 4 }}>
          <BackChevronIcon color={colors.text} size={18} />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Search the web</Text>
      </View>
      <Text style={{ fontSize: 14, color: colors.neutral500, marginBottom: 6 }}>Song title / artist</Text>
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
        <Text style={{ color: colors.bg, fontWeight: '600' }}>Search</Text>
      </TouchableOpacity>
      <Text style={{ marginTop: 20, color: colors.neutral500, fontSize: 15, lineHeight: 18 }}>
        This opens a normal in-app browser. Find a lyrics page you trust, select the text yourself, copy it, then come back
        and tap "Save from clipboard."
      </Text>
    </View>
  );
}
