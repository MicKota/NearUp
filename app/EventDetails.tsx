import React, { useEffect, useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar, Image, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { scheduleEventReminder, cancelEventReminder } from '../utils/notifications';


export default function EventDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const navigation: any = useNavigation();
  const [event, setEvent] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvent() {
      if (!id) {
        setLoading(false);
        return;
      }
      const eventRef = doc(db, 'events', id as string);
      const eventSnap = await getDoc(eventRef);
      if (eventSnap.exists()) {
        const data = eventSnap.data();
        setEvent({ id: eventSnap.id, ...data });
        if (data.userId) {
          const userRef = doc(db, 'users', data.userId as string);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) setCreator(userSnap.data());
        }
      }
      setLoading(false);
    }
    fetchEvent();
  }, [id]);

  // Ustaw tytuł nagłówka nawigacji
  useLayoutEffect(() => {
    try {
      navigation.setOptions({ title: 'Szczegóły wydarzenia' });
    } catch (e) {
      // ignore if navigation not available
    }
  }, [navigation]);

  const toggleJoin = async () => {
    const user = auth.currentUser;
    if (!user || !event) return router.push('/AuthScreen');
    const eventRef = doc(db, 'events', event.id);
    const userRef = doc(db, 'users', user.uid);
    const joined = (event.participants || []).includes(user.uid);
    try {
      if (!joined) {
        await updateDoc(eventRef, { participants: arrayUnion(user.uid) });
        await updateDoc(userRef, { joinedEvents: arrayUnion(event.id) });
        // Schedule reminder notification
        const iso = event.date + 'T' + (event.time || '00:00') + ':00';
        console.log('[EventDetails] Scheduling reminder for:', event.title, iso);
        scheduleEventReminder(event.id, event.title || 'Wydarzenie', iso);
      } else {
        await updateDoc(eventRef, { participants: arrayRemove(user.uid) });
        await updateDoc(userRef, { joinedEvents: arrayRemove(event.id) });
        // Cancel reminder
        cancelEventReminder(event.id);
      }
      // refresh
      const eventSnap = await getDoc(eventRef);
      if (eventSnap.exists()) setEvent({ id: eventSnap.id, ...eventSnap.data() });
    } catch (e) {
      console.error(e);
    }
  };

  const parsedLat = event?.location?.latitude ?? null;
  const parsedLng = event?.location?.longitude ?? null;

  const today = new Date().toISOString().split('T')[0];
  const isPast = !!event && event.date && event.date < today;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>

      {loading ? (
        <ActivityIndicator size="small" color="#4E6EF2" style={{ marginVertical: 10 }} />
      ) : !event ? (
        <Text style={{ color: '#888', marginBottom: 8 }}>Nie znaleziono wydarzenia.</Text>
      ) : (
        <>
          <Text style={styles.title}>{event.title}</Text>

          {creator ? (
            <Pressable style={styles.creatorBox} onPress={() => router.push({ pathname: '/UserProfile', params: { userId: event.userId, fromEventId: event.id } })}>
              <Image source={creator.avatar ? { uri: creator.avatar } : require('../assets/images/avatar-placeholder.png')} style={styles.avatar} />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.creatorNick}>{creator.nick}</Text>
                <Text style={styles.creatorDesc}>{creator.description || 'Brak opisu'}</Text>
              </View>
            </Pressable>
          ) : (
            <Text style={{ color: '#888', marginBottom: 8 }}>Brak informacji o twórcy</Text>
          )}

          <Text style={styles.label}>Opis:</Text>
          <Text style={styles.text}>{event.description}</Text>

          <Text style={styles.label}>Lokalizacja:</Text>
          <Text style={styles.text}>📍 {event.address || 'Brak adresu'}</Text>
          {parsedLat && parsedLng ? (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: parsedLat,
                longitude: parsedLng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{
                  latitude: parsedLat,
                  longitude: parsedLng,
                }}
                title={event.title as string}
                description={event.description as string}
              />
            </MapView>
          ) : null}

          <Text style={styles.label}>Data i czas:</Text>
          <Text style={styles.text}>📅 {event.date} ⏰ {event.time}</Text>

          <Text style={styles.label}>Kategoria:</Text>
          <Text style={styles.text}>{event.category}</Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <Text style={{ color: '#666' }}>{(event.participants || []).length} uczestników</Text>
            <Pressable
              onPress={() => { if (!isPast) toggleJoin(); }}
              style={[
                styles.joinButton,
                (auth.currentUser && (event.participants || []).includes(auth.currentUser.uid)) ? styles.joined : null,
                isPast ? { opacity: 0.6, borderColor: '#ccc' } : null,
              ]}
            >
              <Text style={{ color: isPast ? '#999' : (auth.currentUser && (event.participants || []).includes(auth.currentUser.uid)) ? '#fff' : '#4E6EF2', fontWeight: '600' }}>
                {isPast ? 'Zakończone' : ((auth.currentUser && (event.participants || []).includes(auth.currentUser.uid)) ? 'Dołączono' : 'Dołącz')}
              </Text>
            </Pressable>
          </View>
        </>
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ccc',
  },
  creatorNick: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#4E6EF2',
  },
  creatorDesc: {
    color: '#555',
    fontSize: 13,
    marginTop: 2,
  },
  container: {
    padding: 20,
    backgroundColor: '#fff',
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 12,
    color: '#4E6EF2',
    fontFamily: 'monospace',
  },
  subheader: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
    color: '#444',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    color: '#444',
  },
  text: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  map: {
    height: 200,
    width: '100%',
    borderRadius: 10,
    marginTop: 10,
  },
  joinButton: {
    borderWidth: 1,
    borderColor: '#4E6EF2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  joined: {
    backgroundColor: '#4E6EF2',
  },
});
