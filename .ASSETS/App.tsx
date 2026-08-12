import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import LibraryScreen from './src/screens/LibraryScreen';
import SearchScreen from './src/screens/SearchScreen';
import BrowserScreen from './src/screens/BrowserScreen';
import SaveEntryScreen from './src/screens/SaveEntryScreen';
import ViewEntryScreen from './src/screens/ViewEntryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Library">
        <Stack.Screen name="Library" component={LibraryScreen} options={{ title: 'My Lyrics Library' }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Find Lyrics' }} />
        <Stack.Screen name="Browser" component={BrowserScreen} options={{ title: 'Browse' }} />
        <Stack.Screen name="SaveEntry" component={SaveEntryScreen} options={{ title: 'Save to Library' }} />
        <Stack.Screen name="ViewEntry" component={ViewEntryScreen} options={{ title: 'Lyrics' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
