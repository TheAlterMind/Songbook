import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { BackChevronIcon } from './Icons';

/** Back button and page title, for screens reached from the Library header (Sitness .head). */
export default function ScreenHeader({ title }: { title: string }) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  return (
    <View style={styles.head}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
        <BackChevronIcon color={colors.text} size={ICON.button} />
      </TouchableOpacity>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: TYPE.title, fontWeight: '500', color: colors.text }}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: LAYOUT.top, height: LAYOUT.headerHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 },
  iconBtn: { width: LAYOUT.iconButton, height: LAYOUT.iconButton, alignItems: 'center', justifyContent: 'center' },
});
