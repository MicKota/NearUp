import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Button, TextInput, ScrollView, Alert, Pressable, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db, auth } from '../../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';

export default function UserProfile() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const user = auth.currentUser;
  // Ustal userId: jeśli nie ma w params, użyj aktualnego użytkownika
  const userId = params.userId || (user ? user.uid : undefined);
  const editParam = params.edit;
  const [profile, setProfile] = useState<any>(null);
  const [edit, setEdit] = useState(editParam === 'true');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [nick, setNick] = useState('');
  const [description, setDescription] = useState('');
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>([]);
  const [userEvents, setUserEvents] = useState<any[]>([]);

  // Sprawdzanie zalogowania
  useEffect(() => {
    if (!user) {
      router.replace('/AuthScreen');
      return;
    }
  }, [user]);

  const isOwnProfile = user && user.uid === userId;

  useEffect(() => {
    async function fetchProfileAndEvents() {
      if (userId) {
        const userRef = doc(db, 'users', userId as string);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setProfile(data);
          setAvatar(data.avatar || '');
          setNick(data.nick || '');
          setDescription(data.description || '');
          setFavoriteCategories(data.favoriteCategories || []);
        }
        // Fetch events created by this user
        const eventsQuery = query(collection(db, 'events'), where('userId', '==', userId));
        const eventsSnap = await getDocs(eventsQuery);
        const events = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserEvents(events);
      }
      setLoading(false);
    }
    fetchProfileAndEvents();
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userId as string), {
        avatar,
        nick,
        description,
        favoriteCategories,
      });
      setEdit(false);
      Alert.alert('Zapisano zmiany!');
    } catch (e) {
      Alert.alert('Błąd podczas zapisu.');
    }
    setSaving(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setAvatar(result.assets[0].uri);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.replace('/AuthScreen');
  };

  if (loading) return <View style={styles.center}><Text>Ładowanie...</Text></View>;
  if (!profile) return <View style={styles.center}><Text>Nie znaleziono użytkownika</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ alignItems: 'center', paddingBottom: 40, paddingTop: 20 }}>
      <View style={{ flexDirection: 'row', width: '100%', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flex: 1 }} />
        {isOwnProfile && <Pressable onPress={handleLogout} style={styles.logoutBtn}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Wyloguj się</Text></Pressable>}
      </View>
      <Image source={avatar ? { uri: avatar } : require('../../assets/images/avatar-placeholder.png')} style={styles.avatar} />
      {isOwnProfile && edit && (
        <Button title="Zmień zdjęcie" onPress={pickImage} />
      )}
      {edit ? (
        <TextInput style={styles.input} value={nick} onChangeText={setNick} placeholder="Nick" />
      ) : (
        <Text style={styles.nick}>{profile.nick}</Text>
      )}
      {edit ? (
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Opis/zainteresowania" multiline />
      ) : (
        <Text style={styles.desc}>{profile.description || 'Brak opisu'}</Text>
      )}
      <Text style={styles.label}>Ulubione kategorie:</Text>
      {edit ? (
        <TextInput style={styles.input} value={favoriteCategories.join(', ')} onChangeText={v => setFavoriteCategories(v.split(',').map(s => s.trim()))} placeholder="np. Sport, Kultura" />
      ) : (
        <Text>{(profile.favoriteCategories || []).join(', ') || 'Brak'}</Text>
      )}
      {isOwnProfile && (
        edit ? (
          <Button title={saving ? 'Zapisywanie...' : 'Zapisz'} onPress={handleSave} disabled={saving} />
        ) : (
          <Button title="Edytuj profil" onPress={() => setEdit(true)} />
        )
      )}
      <Text style={styles.label}>Wydarzenia utworzone przez użytkownika:</Text>
      {userEvents.length === 0 ? (
        <Text style={{ color: '#888', marginBottom: 10 }}>Brak utworzonych wydarzeń.</Text>
      ) : (
        userEvents.map(event => {
          // Oblicz ile czasu temu utworzono wydarzenie
          let createdText = '';
          if (event.createdAt) {
            const createdDate = new Date(event.createdAt);
            const now = new Date();
            const diffMs = now.getTime() - createdDate.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            if (diffDays > 0) createdText = `dodano ${diffDays} dni temu`;
            else if (diffHours > 0) createdText = `dodano ${diffHours} godz. temu`;
            else createdText = `dodano ${diffMinutes} min temu`;
          }

          return (
            <Pressable
              key={event.id}
              style={styles.eventCard}
              onPress={() => router.push({
                pathname: '/EventDetails',
                params: {
                  id: event.id,
                  title: event.title,
                  description: event.description,
                  category: event.category,
                  date: event.date,
                  time: event.time,
                  address: event.address,
                  latitude: event.location?.latitude?.toString(),
                  longitude: event.location?.longitude?.toString(),
                  userId: event.userId,
                },
              })}
            >
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventInfo}>{event.description}</Text>
              <Text style={styles.eventDetail}>📍 {event.address || 'Brak adresu'}</Text>
              <Text style={styles.eventDetail}>📅 {event.date} ⏰ {event.time}</Text>
              <Text style={styles.eventCategory}>{event.category}</Text>
              <Text style={styles.eventDetail}>{createdText}</Text>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  creatorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef1ff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#4E6EF2',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ccc',
    marginBottom: 16,
  },
  nick: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4E6EF2',
    marginBottom: 8,
  },
  desc: {
    color: '#555',
    fontSize: 15,
    marginBottom: 8,
    textAlign: 'center',
  },
  label: {
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    width: 250,
    fontSize: 16,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    width: 300,
    alignSelf: 'center',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  eventInfo: {
    marginTop: 4,
    color: '#555',
  },
  eventDetail: {
    marginTop: 4,
    color: '#666',
    fontSize: 14,
  },
  eventCategory: {
    marginTop: 8,
    fontStyle: 'italic',
    color: '#888',
  },
});
