import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, LAYOUT } from '../theme/tokens';

/** Page title for the screens on the bottom menu (Sitness .head). */
export default function ScreenHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.head}>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: TYPE.title, fontWeight: '500', color: colors.text }}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: LAYOUT.top, height: LAYOUT.headerHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
});
