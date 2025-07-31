import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Platform,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import MapView, { Marker } from 'react-native-maps';

type EventItem = {
  id: string;
  title: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
  };
  category: string;
  date: string;
  time: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'events'));
      const data: EventItem[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<EventItem, 'id'>),
      }));
      setEvents(data);
    } catch (error) {
      console.error('Błąd podczas pobierania wydarzeń:', error);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents().finally(() => setRefreshing(false));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logo}>NearUp</Text>
      <Text style={styles.subheader}>Wydarzenia najbliżej Ciebie</Text>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/EventDetails',
                params: {
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  latitude: item.location.latitude.toString(),
                  longitude: item.location.longitude.toString(),
                  category: item.category,
                  date: item.date,
                  time: item.time,
                }
              })
            }
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.info}>{item.description}</Text>
            <Text style={styles.detail}>📍 {item.location.latitude.toFixed(3)}, {item.location.longitude.toFixed(3)}</Text>
            <Text style={styles.detail}>📅 {item.date} ⏰ {item.time}</Text>
            <Text style={styles.category}>{item.category}</Text>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <Pressable
        style={styles.addButton}
        onPress={() => router.push('/CreateEvent')}
      >
        <Ionicons name="add" size={32} color="white" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fefefe',
    paddingHorizontal: 16,
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  info: {
    marginTop: 4,
    color: '#555',
  },
  map: {
    height: 150,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  detail: {
    marginTop: 4,
    color: '#666',
    fontSize: 14,
  },
  category: {
    marginTop: 8,
    fontStyle: 'italic',
    color: '#888',
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    backgroundColor: '#4E6EF2',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
});
