import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

import LibraryScreen from './src/screens/LibraryScreen';
import LibrarySearchScreen from './src/screens/LibrarySearchScreen';
import CollectionsScreen from './src/screens/CollectionsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CollectionDetailScreen from './src/screens/CollectionDetailScreen';
import DetailScreen from './src/screens/DetailScreen';
import EditScreen from './src/screens/EditScreen';
import AddScreen from './src/screens/AddScreen';
import WebSearchScreen from './src/screens/WebSearchScreen';
import BrowserScreen from './src/screens/BrowserScreen';
import AddToCollectionScreen from './src/screens/AddToCollectionScreen';
import { LibraryTabIcon, SearchTabIcon, CollectionsTabIcon, SettingsTabIcon } from './src/components/Icons';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.neutral500,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.divider, borderTopWidth: 1 },
      }}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{ tabBarIcon: ({ color, size }) => <LibraryTabIcon color={color} size={size} /> }}
      />
      <Tab.Screen
        name="LibrarySearch"
        component={LibrarySearchScreen}
        options={{ title: 'Search', tabBarIcon: ({ color, size }) => <SearchTabIcon color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Collections"
        component={CollectionsScreen}
        options={{ tabBarIcon: ({ color, size }) => <CollectionsTabIcon color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <SettingsTabIcon color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { colors, loaded } = useTheme();
  if (!loaded) return null;
  return (
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
