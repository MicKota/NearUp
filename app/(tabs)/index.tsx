import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';



function HomeScreen() {
  type EventItem = {
    id: string;
    title: string;
    description: string;
    location: {
      latitude: number;
      longitude: number;
    };
    address?: string;
    category: string;
    date: string;
    time: string;
  };

  const router = useRouter();
  const params = useLocalSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [sortOption, setSortOption] = useState<'nearest' | 'latest' | null>(null);

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  const filterAndSortEvents = useCallback(() => {
    let data = [...events];

    if (categoryFilter) {
      data = data.filter((e) =>
        e.category.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    if (dateFilter) {
      const selectedDate = dateFilter.toISOString().split('T')[0];
      data = data.filter((e) => e.date === selectedDate);
    }

    if (sortOption === 'nearest' && userLocation) {
      data.sort((a, b) => {
        const distA = Math.sqrt(
          Math.pow(a.location.latitude - userLocation.latitude, 2) +
          Math.pow(a.location.longitude - userLocation.longitude, 2)
        );
        const distB = Math.sqrt(
          Math.pow(b.location.latitude - userLocation.latitude, 2) +
          Math.pow(b.location.longitude - userLocation.longitude, 2)
        );
        return distA - distB;
      });
    }

    if (sortOption === 'latest') {
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    setFilteredEvents(data);
  }, [events, categoryFilter, dateFilter, sortOption, userLocation]);


  useEffect(() => {
    fetchLocation();
  }, []);

  // Odświeżaj listę przy pierwszym wejściu i po powrocie z parametrem refresh
  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [params.refresh])
  );

  useEffect(() => {
    filterAndSortEvents();
  }, [events, categoryFilter, dateFilter, sortOption]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents().finally(() => setRefreshing(false));
  }, []);

  const handleMarkerPress = (event: EventItem) => {
    setSelectedEvent(event);
  };

  const resetFilters = () => {
    setCategoryFilter('');
    setDateFilter(null);
    setSortOption(null);
    setFilterModalVisible(false);
  };

  const renderActiveFilters = () => {
    const active: string[] = [];
    if (categoryFilter) active.push(`Kategoria: ${categoryFilter}`);
    if (dateFilter) active.push(`Data: ${dateFilter.toISOString().split('T')[0]}`);
    if (sortOption === 'nearest') active.push('Sort: Najbliższe');
    if (sortOption === 'latest') active.push('Sort: Najnowsze');

    if (active.length === 0) return null;

    return (
      <View style={styles.activeFiltersContainer}>
        {active.map((filter, index) => (
          <Text key={index} style={styles.activeFilterText}>• {filter}</Text>
        ))}
      </View>
    );
  };

  const renderListView = () => (
    <FlatList
      data={filteredEvents}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
                address: item.address,
                latitude: item.location.latitude.toString(),
                longitude: item.location.longitude.toString(),
              },
            })
          }
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.info}>{item.description}</Text>
          <Text style={styles.detail}>📍 {item.address || 'Brak adresu'}</Text>
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
        {filteredEvents.map((event) => (
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
          <Text style={styles.popupInfo}>📍 {selectedEvent.address || 'Brak adresu'}</Text>
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
                  address: selectedEvent.address,
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

      <View style={styles.headerRow}>
        <Text style={styles.subheader}>Wydarzenia najbliżej Ciebie</Text>
        <View style={styles.switchContainer}>
          <Pressable onPress={() => setViewMode('list')}>
            <Text style={[styles.switchText, viewMode === 'list' && styles.activeSwitch]}>Lista</Text>
          </Pressable>
          <Text style={styles.switchText}> | </Text>
          <Pressable onPress={() => setViewMode('map')}>
            <Text style={[styles.switchText, viewMode === 'map' && styles.activeSwitch]}>Mapa</Text>
          </Pressable>
        </View>
      </View>

      {renderActiveFilters()}

      <View style={{ alignItems: 'flex-end', marginBottom: 10 }}>
        <Pressable onPress={() => setFilterModalVisible(true)} style={styles.filterButton}>
          <Ionicons name="options" size={20} color="#fff" />
          <Text style={{ color: '#fff', marginLeft: 6 }}>Filtruj</Text>
        </Pressable>
      </View>

      {viewMode === 'list' ? renderListView() : renderMapView()}

      <Pressable style={styles.addButton} onPress={() => router.push('/CreateEvent')}>
        <Ionicons name="add" size={32} color="white" />
      </Pressable>

      <Modal visible={filterModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Filtry</Text>
            <Text style={{ marginTop: 10 }}>Kategoria</Text>
            <View style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginTop: 6 }}>
              <Picker
                selectedValue={categoryFilter}
                onValueChange={(itemValue) => setCategoryFilter(itemValue)}>
                <Picker.Item label="Wybierz kategorię" value="" />
                <Picker.Item label="Koncert" value="Koncert" />
                <Picker.Item label="Sport" value="Sport" />
                <Picker.Item label="Kultura" value="Kultura" />
                <Picker.Item label="Inne" value="Inne" />
              </Picker>
            </View>
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.input}>
              <Text>{dateFilter ? dateFilter.toDateString() : 'Wybierz datę'}</Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={dateFilter || new Date()}
                mode="date"
                display="default"
                onChange={(e, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) setDateFilter(selectedDate);
                }}
              />
            )}

            <Text style={{ marginTop: 10 }}>Sortowanie:</Text>
            <View style={styles.sortButtons}>
              <Pressable onPress={() => setSortOption('nearest')} style={[styles.sortOption, sortOption === 'nearest' && styles.activeSort]}>
                <Text style={styles.sortText}>Najbliższe</Text>
              </Pressable>
              <Pressable onPress={() => setSortOption('latest')} style={[styles.sortOption, sortOption === 'latest' && styles.activeSort]}>
                <Text style={styles.sortText}>Najnowsze</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable onPress={resetFilters} style={styles.resetButton}>
                <Text style={{ color: '#4E6EF2' }}>Resetuj</Text>
              </Pressable>
              <Pressable onPress={() => setFilterModalVisible(false)} style={styles.confirmButton}>
                <Text style={{ color: '#fff' }}>Zastosuj</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subheader: {
    fontSize: 16,
    color: '#444',
    fontWeight: '500',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    color: '#888',
    marginHorizontal: 4,
  },
  activeSwitch: {
    color: '#4E6EF2',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  activeFiltersContainer: {
    backgroundColor: '#eef1ff',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  activeFilterText: {
    fontSize: 13,
    color: '#4E6EF2',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
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
  filterButton: {
    flexDirection: 'row',
    backgroundColor: '#4E6EF2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    width: '85%',
    padding: 20,
    borderRadius: 12,
    elevation: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  sortButtons: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  sortOption: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#4E6EF2',
    borderRadius: 6,
    backgroundColor: '#9ed4deff',
  },
  activeSort: {
    backgroundColor: '#4E6EF2',
  },
  sortText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  resetButton: {
    borderWidth: 1,
    borderColor: '#4E6EF2',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  confirmButton: {
    backgroundColor: '#4E6EF2',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});

export default HomeScreen;
