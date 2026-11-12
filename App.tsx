import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { LAYOUT } from './src/theme/tokens';

import LibraryScreen from './src/screens/LibraryScreen';
import CollectionsScreen from './src/screens/CollectionsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CollectionDetailScreen from './src/screens/CollectionDetailScreen';
import DetailScreen from './src/screens/DetailScreen';
import EditScreen from './src/screens/EditScreen';
import AddScreen from './src/screens/AddScreen';
import WebSearchScreen from './src/screens/WebSearchScreen';
import BrowserScreen from './src/screens/BrowserScreen';
import AddToCollectionScreen from './src/screens/AddToCollectionScreen';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { colors, loaded, wide, settings } = useTheme();
  if (!loaded) return null;
  // Phone: full width. Wide window: one centred column with thin side borders, like Sitness.
  const column = wide
    ? { maxWidth: LAYOUT.maxWidth, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.divider }
    : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.outer }}>
      <StatusBar style={settings.lightMode ? 'dark' : 'light'} />
      <View style={[{ flex: 1, width: '100%', alignSelf: 'center', backgroundColor: colors.bg, overflow: 'hidden' }, column]}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="Library" component={LibraryScreen} />
            <Stack.Screen name="Collections" component={CollectionsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="WebSearch" component={WebSearchScreen} />
            <Stack.Screen name="Browser" component={BrowserScreen} />
            <Stack.Screen name="Add" component={AddScreen} />
            <Stack.Screen name="Edit" component={EditScreen} />
            <Stack.Screen name="Detail" component={DetailScreen} />
            <Stack.Screen name="CollectionDetail" component={CollectionDetailScreen} />
            <Stack.Screen name="AddToCollection" component={AddToCollectionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
