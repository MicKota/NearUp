import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TextInput, ScrollView, Alert, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db, auth } from '../../firebase';
import CategorySelector from '../../components/CategorySelector';
import { NICK_MIN_LENGTH, NICK_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '../../constants/Validation';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';

export default function UserProfile() {
  const router = useRouter();
  const user = auth.currentUser;
  
  const [profile, setProfile] = useState<any>(null);
  const [edit, setEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [nick, setNick] = useState('');
  const [description, setDescription] = useState('');
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>([]);
  const [userEvents, setUserEvents] = useState<any[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<any[]>([]);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const fetchProfileAndEvents = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (user?.uid) {
      const userRef = doc(db, 'users', user.uid);
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
      const eventsQuery = query(collection(db, 'events'), where('userId', '==', user.uid));
      const eventsSnap = await getDocs(eventsQuery);
      const events = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserEvents(events);
      // Fetch events the user joined
      const joinedQuery = query(collection(db, 'events'), where('participants', 'array-contains', user.uid));
      const joinedSnap = await getDocs(joinedQuery);
      const joined = joinedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJoinedEvents(joined);
    }
    setLoading(false);
  }, [user?.uid]);

  useEffect(() => {
    fetchProfileAndEvents();
  }, [fetchProfileAndEvents]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProfileAndEvents().finally(() => setRefreshing(false));
  }, [fetchProfileAndEvents]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validate inputs
      if (!nick || nick.length < NICK_MIN_LENGTH) {
        Alert.alert(`Nick musi mieć co najmniej ${NICK_MIN_LENGTH} znaki`);
        setSaving(false);
        return;
      }
      if (nick.length > NICK_MAX_LENGTH) {
        Alert.alert(`Nick może mieć maksymalnie ${NICK_MAX_LENGTH} znaków`);
        setSaving(false);
        return;
      }
      if (description && description.length > DESCRIPTION_MAX_LENGTH) {
        Alert.alert(`Opis może mieć maksymalnie ${DESCRIPTION_MAX_LENGTH} znaków`);
        setSaving(false);
        return;
      }
      await updateDoc(doc(db, 'users', user!.uid), {
        avatar,
        nick,
        description,
        favoriteCategories,
      });
      setEdit(false);
      Alert.alert('Zapisano zmiany!');
      // Refresh profile and related data so UI shows latest values
      await fetchProfileAndEvents();
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

  const handleCancel = () => {
    // Revert local edits and leave edit mode without saving
    setAvatar(profile?.avatar || '');
    setNick(profile?.nick || '');
    setDescription(profile?.description || '');
    setFavoriteCategories(profile?.favoriteCategories || []);
    setEdit(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Hasło musi mieć co najmniej 6 znaków');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Hasła nie są identyczne');
      return;
    }
    setChangingPassword(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword as string);
        Alert.alert('Hasło zmienione pomyślnie');
        setShowChangePassword(false);
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') {
        Alert.alert('W celu zmiany hasła wymagana jest ponowna autoryzacja. Zaloguj się ponownie.');
        await auth.signOut();
        router.replace('/AuthScreen');
      } else {
        Alert.alert('Błąd podczas zmiany hasła', e?.message || String(e));
      }
    }
    setChangingPassword(false);
  };

  // Wyświetl ekran logowania dla niezalogowanych
  if (!user) {
    return (
      <View style={styles.center}>
        <Ionicons name="person-circle-outline" size={80} color="#ccc" style={{ marginBottom: 20 }} />
        <Text style={styles.notLoggedInText}>Nie jesteś zalogowany</Text>
        <Text style={styles.notLoggedInSubtext}>Zaloguj się, aby zobaczyć swój profil</Text>
        <Pressable onPress={() => router.push('/AuthScreen')} style={styles.loginButton}>
          <Text style={styles.loginButtonText}>Zaloguj się</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) return <View style={styles.center}><Text>Ładowanie...</Text></View>;
  if (!profile) return <View style={styles.center}><Text>Nie znaleziono użytkownika</Text></View>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ alignItems: 'center', paddingBottom: 40, paddingTop: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ flexDirection: 'row', width: '100%', alignItems: 'center', marginBottom: 10 }}>
        {edit ? (
          <Pressable onPress={() => { if (!saving) handleSave(); }} style={styles.editBtnLeft}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{saving ? 'Zapisywanie...' : 'Zapisz'}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setEdit(true)} style={styles.editBtnLeft}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Edytuj</Text></Pressable>
        )}
        <View style={{ flex: 1 }} />
        {edit ? (
          <Pressable onPress={handleCancel} style={styles.cancelBtn}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Anuluj</Text></Pressable>
        ) : (
          <Pressable onPress={handleLogout} style={styles.logoutBtn}><Text style={{ color: '#fff', fontWeight: 'bold' }}>Wyloguj się</Text></Pressable>
        )}
      </View>
      <Image source={avatar ? { uri: avatar } : require('../../assets/images/avatar-placeholder.png')} style={styles.avatar} />
      {edit && (
        <Pressable onPress={pickImage} style={styles.changePicBtn}>
          <Text style={styles.changePicBtnText}>Zmień zdjęcie</Text>
        </Pressable>
      )}
      {edit && (
        <>
          <Text style={styles.label}>Email:</Text>
          <TextInput style={[styles.input, styles.disabledInput]} value={user?.email || ''} editable={false} selectTextOnFocus={false} />
          <Pressable onPress={() => setShowChangePassword(s => !s)} style={styles.changePassBtn}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{showChangePassword ? 'Anuluj zmianę hasła' : 'Zmień hasło'}</Text>
          </Pressable>
          {showChangePassword && (
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <Text style={styles.label}>Nowe hasło:</Text>
              <TextInput placeholder="Nowe hasło" secureTextEntry style={styles.input} value={newPassword} onChangeText={setNewPassword} />
              <Text style={styles.label}>Powtórz nowe hasło:</Text>
              <TextInput placeholder="Powtórz nowe hasło" secureTextEntry style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} />
              <Pressable onPress={handleChangePassword} style={styles.savePassBtn}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{changingPassword ? 'Zmiana...' : 'Zapisz hasło'}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
      {edit ? (
        <>
          <Text style={styles.label}>Nick:</Text>
          <TextInput style={styles.input} value={nick} onChangeText={setNick} placeholder="Nick" maxLength={NICK_MAX_LENGTH} />
        </>
      ) : (
        <Text style={styles.nick}>{profile?.nick}</Text>
      )}
      {edit ? (
        <>
          <Text style={styles.label}>Opis:</Text>
          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Opis/zainteresowania" multiline maxLength={DESCRIPTION_MAX_LENGTH} />
        </>
      ) : (
        <Text style={styles.desc}>{profile?.description || 'Brak opisu'}</Text>
      )}
      {edit ? (
        <CategorySelector selected={favoriteCategories} onChange={setFavoriteCategories} />
      ) : (
        <>
          <Text style={styles.label}>Ulubione kategorie:</Text>
          <Text>{(profile?.favoriteCategories || []).join(', ') || 'Brak'}</Text>
        </>
      )}
      {/* save button moved to top-left; removed duplicate bottom button */}
      {!edit && (
        <>
          <Text style={styles.label}>Wydarzenia do których dołączyłeś:</Text>
          {joinedEvents.length === 0 ? (
            <Text style={{ color: '#888', marginBottom: 10 }}>Nie dołączyłeś jeszcze do żadnego wydarzenia.</Text>
          ) : (
            joinedEvents.map(event => (
              <Pressable
                key={event.id}
                style={styles.eventCard}
                onPress={() => router.push({ pathname: '/EventDetails', params: { id: event.id } })}
              >
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventInfo}>{event.description}</Text>
                <Text style={styles.eventDetail}>📅 {event.date} ⏰ {event.time}</Text>
                <Text style={styles.eventCategory}>{event.category}</Text>
              </Pressable>
            ))
          )}
        </>
      )}
      {!edit && (
        <>
          <Text style={styles.label}>Wydarzenia które dodałeś:</Text>
          {userEvents.length === 0 ? (
            <Text style={{ color: '#888', marginBottom: 10 }}>Nie dodałeś jeszcze żadnego wydarzenia.</Text>
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
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  editBtnLeft: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#4E6EF2',
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#4E6EF2',
  },
  cancelBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#888',
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
    backgroundColor: '#fff',
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
  changePicBtn: {
    backgroundColor: '#4E6EF2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  changePicBtnText: { color: '#fff', fontWeight: '600' },
  changePassBtn: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  savePassBtn: {
    backgroundColor: '#4E6EF2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  disabledInput: {
    backgroundColor: '#f3f3f3',
    color: '#666',
  },
  notLoggedInText: {
    fontSize: 20,
    color: '#333',
    marginBottom: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  notLoggedInSubtext: {
    fontSize: 15,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#4E6EF2',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
