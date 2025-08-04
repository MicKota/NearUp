import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Pressable, Image } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useRouter } from 'expo-router';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();


  const handleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Zapisz nick do Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          nick,
          email,
          avatar: '',
          favoriteCategories: [],
          description: '',
        });
        // Przekieruj na ekran edycji profilu
        router.replace({ pathname: '/UserProfile', params: { userId: userCredential.user.uid, edit: 'true' } });
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };


  return (
    <View style={styles.container}>
      <Text style={styles.logo}>NearUp</Text>
      <Text style={styles.header}>{isLogin ? 'Logowanie' : 'Rejestracja'}</Text>
      {!isLogin && (
        <TextInput
          style={styles.input}
          placeholder="Nick (unikalny)"
          value={nick}
          onChangeText={setNick}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Hasło"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button title={isLogin ? 'Zaloguj się' : 'Zarejestruj się'} onPress={handleAuth} disabled={loading} />
      {/* Usunięto logowanie Google/Facebook */}
      <Pressable onPress={() => setIsLogin((v) => !v)} style={{ marginTop: 20 }}>
        <Text style={{ color: '#4E6EF2' }}>{isLogin ? 'Nie masz konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  logo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4E6EF2',
    marginBottom: 16,
  },
  header: {
    fontSize: 20,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    width: 260,
    fontSize: 16,
  },
  error: {
    color: 'red',
    marginBottom: 8,
  },
  socialBtn: {
    backgroundColor: '#4E6EF2',
    padding: 10,
    borderRadius: 8,
  },
  socialText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
