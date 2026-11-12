import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/** Album cover, or a quiet square with the song's first letter while there is none. */
export default function Cover({ uri, size, title }: { uri?: string | null; size: number; title: string }) {
  const { colors, radius } = useTheme();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [uri]);
  const box = { width: size, height: size, borderRadius: radius.sm, overflow: 'hidden' as const, backgroundColor: colors.well };
  if (uri && !broken) {
    return (
      <View style={box}>
        <Image source={{ uri }} style={{ width: size, height: size }} onError={() => setBroken(true)} />
      </View>
    );
  }
  return (
    <View style={[box, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: size * 0.4, color: colors.neutral500, fontWeight: '500' }}>
        {(title.trim()[0] || '♪').toUpperCase()}
      </Text>
    </View>
  );
}
