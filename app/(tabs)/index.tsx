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
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

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
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

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

  const fetchLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const loc = await Location.getCurrentPositionAsync({});
    setUserLocation({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
  };

  useEffect(() => {
    fetchEvents();
    fetchLocation();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents().finally(() => setRefreshing(false));
  }, []);

  const handleMarkerPress = (event: EventItem) => {
    setSelectedEvent(event);
  };

  const renderListView = () => (
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
                category: item.category,
                date: item.date,
                time: item.time,
                latitude: item.location.latitude.toString(),
                longitude: item.location.longitude.toString(),
              },
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
  );

  const renderMapView = () => (
    <View style={styles.mapContainer}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: userLocation?.latitude || 52.2297,
          longitude: userLocation?.longitude || 21.0122,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        showsUserLocation
      >
        {events.map((event) => (
          <Marker
            key={event.id}
            coordinate={event.location}
            title={event.title}
            onPress={() => handleMarkerPress(event)}
          />
        ))}
      </MapView>

      {selectedEvent && (
        <View style={styles.popup}>
          <Text style={styles.popupTitle}>{selectedEvent.title}</Text>
          <Text style={styles.popupInfo}>📅 {selectedEvent.date} ⏰ {selectedEvent.time}</Text>
          <Text style={styles.popupInfo}>📍 {selectedEvent.location.latitude.toFixed(3)}, {selectedEvent.location.longitude.toFixed(3)}</Text>
          <Pressable
            style={styles.detailsButton}
            onPress={() => {
              setSelectedEvent(null);
              router.push({
                pathname: '/EventDetails',
                params: {
                  id: selectedEvent.id,
                  title: selectedEvent.title,
                  description: selectedEvent.description,
                  category: selectedEvent.category,
                  date: selectedEvent.date,
                  time: selectedEvent.time,
                  latitude: selectedEvent.location.latitude.toString(),
                  longitude: selectedEvent.location.longitude.toString(),
                },
              });
            }}
          >
            <Text style={{ color: '#fff' }}>Zobacz szczegóły</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logo}>NearUp</Text>

      <View style={styles.switchContainer}>
        <Pressable onPress={() => setViewMode('list')}>
          <Text style={[styles.switchText, viewMode === 'list' && styles.activeSwitch]}>Lista</Text>
        </Pressable>
        <Text style={styles.switchText}> | </Text>
        <Pressable onPress={() => setViewMode('map')}>
          <Text style={[styles.switchText, viewMode === 'map' && styles.activeSwitch]}>Mapa</Text>
        </Pressable>
      </View>

      <Text style={styles.subheader}>Wydarzenia najbliżej Ciebie</Text>

      {viewMode === 'list' ? renderListView() : renderMapView()}

      <Pressable style={styles.addButton} onPress={() => router.push('/CreateEvent')}>
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
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 4,
  },
  switchText: {
    fontSize: 16,
    color: '#888',
    marginHorizontal: 4,
  },
  activeSwitch: {
    color: '#4E6EF2',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
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
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
    borderRadius: 10,
  },
  popup: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  popupInfo: {
    fontSize: 14,
    color: '#444',
    marginBottom: 4,
  },
  detailsButton: {
    marginTop: 10,
    backgroundColor: '#4E6EF2',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
});
