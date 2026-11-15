import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Text } from '../components/Typography';
import { BackChevronIcon } from '../components/Icons';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, LAYOUT } from '../theme/tokens';
import Metronome from '../tools/Metronome';
import Tuner from '../tools/Tuner';

type Tool = 'metronome' | 'tuner';

/**
 * Tools for practice: a metronome and a tuner. Settings picks which one to show, and the back arrow returns there.
 * The screen has no button in the bottom menu, but it stays loaded once opened, so the metronome keeps ticking while
 * you move to another screen to read lyrics; the tuner lets go of the microphone as soon as you leave it.
 * The metronome fills the space between the top row and the bottom menu; the tuner scrolls if a screen is too short.
 */
export default function ToolsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [tool, setTool] = useState<Tool>('metronome');
  const focused = useIsFocused();

  // Settings opens this screen with the tool to show.
  useEffect(() => {
    if (route.params?.tool === 'metronome' || route.params?.tool === 'tuner') setTool(route.params.tool);
  }, [route.params?.tool]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ marginTop: LAYOUT.top + 8, paddingHorizontal: 18, marginBottom: tool === 'metronome' ? 24 : 72 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
          style={{ flexDirection: 'row', alignItems: 'center', height: 48, gap: 6, alignSelf: 'flex-start' }}
        >
          <BackChevronIcon color={colors.accent} size={22} />
          <Text style={{ fontSize: TYPE.title, fontWeight: '500', color: colors.text }}>{tool === 'metronome' ? 'Metronome' : 'Guitar tuner'}</Text>
        </TouchableOpacity>
      </View>
      {/* The bottom padding keeps the tool clear of the menu. */}
      <View style={{ flex: 1, paddingHorizontal: 18, paddingBottom: 16 }}>
        {tool === 'metronome' ? (
          <Metronome />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <Tuner active={focused} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}
