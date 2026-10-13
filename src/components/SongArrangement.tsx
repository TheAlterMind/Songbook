import React from 'react';
import { Text, View } from 'react-native';
import type { SongLine } from '../db/Database';
import { useTheme } from '../theme/ThemeContext';
import { arrangementUnits, lineHasChords } from '../utils/arrangement';

export default function SongArrangement({ lines, fontSize = 17, chordsOn = true }: {
  lines: SongLine[]; fontSize?: number; chordsOn?: boolean;
}) {
  const { colors } = useTheme();
  return <View>{lines.map((line, index) => {
    if (!chordsOn || !lineHasChords(line)) return <Text key={index} selectable
      style={{ color: colors.text, fontSize, lineHeight: fontSize * 1.5, marginBottom: 9 }}>{line.text || ' '}</Text>;
    return <View key={index} style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 9 }}>
      {arrangementUnits(line).map((unit, unitIndex) => <View key={unitIndex} style={{ maxWidth: '100%' }}>
        <Text style={{ color: colors.accent, fontSize, lineHeight: fontSize * 1.3, fontWeight: '600', paddingRight: unit.chord ? fontSize * 0.3 : 0 }}>{unit.chord || ' '}</Text>
        <Text selectable style={{ color: colors.text, fontSize, lineHeight: fontSize * 1.5 }}>{unit.text || ' '}</Text>
      </View>)}
    </View>;
  })}</View>;
}
