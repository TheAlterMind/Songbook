import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { MetronomeIcon, TunerIcon } from '../components/Icons';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, LAYOUT } from '../theme/tokens';
import Metronome from '../tools/Metronome';
import Tuner from '../tools/Tuner';

type Tool = 'metronome' | 'tuner';

/**
 * Tools for practice: a metronome and a tuner, switched from the pill at the top. The metronome keeps ticking while
 * you move to another screen to read lyrics; the tuner lets go of the microphone as soon as you leave it.
 * The metronome fills the space between the pill and the bottom menu; the tuner scrolls if a screen is too short.
 */
export default function ToolsScreen() {
  const { colors, radius } = useTheme();
  const [tool, setTool] = useState<Tool>('metronome');
  const focused = useIsFocused();

  const tab = (value: Tool, label: string, Icon: (p: { color?: string; size?: number }) => React.ReactElement) => {
    const on = tool === value;
    return (
      <TouchableOpacity
        key={value}
        onPress={() => setTool(value)}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        style={{
          flex: 1,
          height: 40,
          borderRadius: radius.md - 4,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? colors.accent : 'transparent',
        }}
      >
        <Icon size={24} color={on ? colors.accent100 : colors.text} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ marginTop: LAYOUT.top + 8, paddingHorizontal: 18, marginBottom: tool === 'metronome' ? 24 : 72 }}>
        <View style={{ flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.well }}>
          {tab('metronome', 'Metronome', MetronomeIcon)}
          {tab('tuner', 'Tuner', TunerIcon)}
        </View>
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
