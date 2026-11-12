import React from 'react';
import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily } from '../theme/fonts';

// React Native has no app-wide font, so every screen uses these two. The chosen font goes first in the
// style, so a text that names its own fontFamily (the monospace chord lines) keeps it.

export const Text = React.forwardRef<RNText, TextProps>((props, ref) => {
  const { settings } = useTheme();
  const family = fontFamily(settings.font);
  return <RNText ref={ref} {...props} style={family ? [{ fontFamily: family }, props.style] : props.style} />;
});
Text.displayName = 'Text';

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>((props, ref) => {
  const { settings } = useTheme();
  const family = fontFamily(settings.font);
  return <RNTextInput ref={ref} {...props} style={family ? [{ fontFamily: family }, props.style] : props.style} />;
});
TextInput.displayName = 'TextInput';
