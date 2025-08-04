

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar, Image, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function EventDetails() {
  const { title, description, address, category, date, time, latitude, longitude, userId } = useLocalSearchParams();
  const router = useRouter();
  const parsedLat = latitude ? parseFloat(latitude as string) : null;
  const parsedLng = longitude ? parseFloat(longitude as string) : null;

  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCreator() {
      if (userId) {
        const userRef = doc(db, 'users', userId as string);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setCreator(userSnap.data());
        }
      }
      setLoading(false);
    }
    fetchCreator();
  }, [userId]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.logo}>NearUp</Text>
      <Text style={styles.subheader}>Szczegóły wydarzenia</Text>

      <Text style={styles.title}>{title}</Text>

      {loading ? (
        <ActivityIndicator size="small" color="#4E6EF2" style={{ marginVertical: 10 }} />
      ) : creator ? (
        <Pressable style={styles.creatorBox} onPress={() => router.push({ pathname: '/UserProfile', params: { userId } })}>
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
      <Text style={styles.text}>{description}</Text>

      <Text style={styles.label}>Lokalizacja:</Text>
      <Text style={styles.text}>📍 {address || 'Brak adresu'}</Text>
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
            title={title as string}
            description={description as string}
          />
        </MapView>
      ) : null}

      <Text style={styles.label}>Data i czas:</Text>
      <Text style={styles.text}>📅 {date} ⏰ {time}</Text>

      <Text style={styles.label}>Kategoria:</Text>
      <Text style={styles.text}>{category}</Text>
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
});
