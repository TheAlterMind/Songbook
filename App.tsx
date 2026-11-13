import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { ICON, LAYOUT } from './src/theme/tokens';

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
import CoverPickerScreen from './src/screens/CoverPickerScreen';
import { ToastProvider } from './src/components/Toast';
import { LibraryTabIcon, CollectionsTabIcon, SettingsTabIcon } from './src/components/Icons';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.neutral500,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: colors.menuBg, borderTopWidth: 0, elevation: 0, shadowOpacity: 0, height: 44 + insets.bottom, paddingBottom: 0 },
        tabBarItemStyle: { paddingTop: 3, paddingBottom: 0, justifyContent: 'center' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{ title: 'List', tabBarIcon: ({ color }) => <LibraryTabIcon color={color} size={ICON.tab} /> }}
      />
      <Tab.Screen
        name="Collections"
        component={CollectionsScreen}
        options={{ tabBarIcon: ({ color }) => <CollectionsTabIcon color={color} size={ICON.tab} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color }) => <SettingsTabIcon color={color} size={ICON.tab} /> }}
      />
    </Tab.Navigator>
  );
}

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
        <ToastProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="WebSearch" component={WebSearchScreen} />
            <Stack.Screen name="Browser" component={BrowserScreen} />
            <Stack.Screen name="Add" component={AddScreen} />
            <Stack.Screen name="Edit" component={EditScreen} />
            <Stack.Screen name="Detail" component={DetailScreen} />
            <Stack.Screen name="CollectionDetail" component={CollectionDetailScreen} />
            <Stack.Screen name="AddToCollection" component={AddToCollectionScreen} />
            <Stack.Screen name="CoverPicker" component={CoverPickerScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        </ToastProvider>
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
