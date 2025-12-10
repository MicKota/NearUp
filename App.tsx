import React, { useEffect, useState } from 'react';
import { auth } from './firebase';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthScreen from './app/AuthScreen';
import HomeScreen from './app/(tabs)/index';
import CreateEvent from './app/CreateEvent';
import UserProfile from './app/(tabs)/UserProfile';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="AuthScreen" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="CreateEvent" component={CreateEvent} />
            <Stack.Screen name="UserProfile" component={UserProfile} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
