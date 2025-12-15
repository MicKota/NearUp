import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Pressable, Image, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import CategorySelector from '../components/CategorySelector';
import { NICK_MIN_LENGTH, NICK_MAX_LENGTH } from '../constants/Validation';
import { useRouter } from 'expo-router';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>([]);
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
        // Validate nick length
        if (!nick || nick.length < NICK_MIN_LENGTH) {
          Alert.alert(`Nick musi mieć co najmniej ${NICK_MIN_LENGTH} znaki`);
          setLoading(false);
          return;
        }
        if (nick.length > NICK_MAX_LENGTH) {
          Alert.alert(`Nick może mieć maksymalnie ${NICK_MAX_LENGTH} znaków`);
          setLoading(false);
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Zapisz nick do Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          nick,
          email,
          avatar: '',
          favoriteCategories,
          description: '',
        });
        // Przekieruj na ekran edycji profilu
        router.replace({ pathname: '/(tabs)/UserProfile', params: { userId: userCredential.user.uid, edit: 'true' } });
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };


  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>NearUp</Text>
        <Text style={styles.header}>{isLogin ? 'Logowanie' : 'Rejestracja'}</Text>
        {!isLogin && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Nick (unikalny)"
              value={nick}
              onChangeText={setNick}
              maxLength={NICK_MAX_LENGTH}
            />
            <CategorySelector selected={favoriteCategories} onChange={setFavoriteCategories} />
          </>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
