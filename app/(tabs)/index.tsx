// Lokalny typ wydarzenia
type EventItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  address?: string;
  location: { latitude: number; longitude: number };
  userId: string;
  createdAt?: string;
  participants?: string[];
};
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PanResponder } from 'react-native';
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
import { collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { firebaseErrorMessage } from '../../utils/firebaseErrors';
import { registerForNotifications, presentLocalNotification, scheduleEventReminder, cancelEventReminder, getCurrentViewingEvent } from '../../utils/notifications';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { EventCategory } from '../../types/eventCategory';
import CategorySelector from '../../components/CategorySelector';
import { Alert } from 'react-native';




function HomeScreen() {
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const params = useLocalSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | ''>('');
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [sortOption, setSortOption] = useState<string | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null); // km

  // Tymczasowe (pending) filtry używane w modalnym UI — stosujemy je dopiero po naciśnięciu "Pokaż"
  const [pendingCategoryFilter, setPendingCategoryFilter] = useState<EventCategory | ''>('');
  const [pendingDateFilter, setPendingDateFilter] = useState<Date | null>(null);
  const [pendingSortOption, setPendingSortOption] = useState<string | null>(null);
  const [pendingDistanceFilter, setPendingDistanceFilter] = useState<number | null>(null);

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Skopiuj aktualne filtry do pending kiedy otwieramy modal
  useEffect(() => {
    if (filterModalVisible) {
      setPendingCategoryFilter(categoryFilter);
      setPendingDateFilter(dateFilter);
      setPendingSortOption(sortOption);
      setPendingDistanceFilter(distanceFilter);
    }
  }, [filterModalVisible]);

  // Listen for new messages in events the user might be interested in and show local notification
  const messageUnsubsRef = React.useRef<Record<string, () => void>>({});
  const lastMsgIdRef = React.useRef<Record<string, string>>({});
  const initialLoadRef = React.useRef<Record<string, boolean>>({});

  useEffect(() => {
    // Register for notifications on mount
    registerForNotifications();
  }, []);

  useEffect(() => {
    // clear old listeners
    Object.values(messageUnsubsRef.current).forEach(u => u && u());
    messageUnsubsRef.current = {};
    // Don't clear lastMsgIdRef - keep tracking to avoid re-notifying

    const currentUserId = auth.currentUser?.uid;

    // subscribe to latest message for each event
    events.forEach((ev) => {
      try {
        const q = query(collection(db, 'events', ev.id, 'messages'), orderBy('timestamp', 'desc'), limit(1));
        const unsub = onSnapshot(q, (snap) => {
          if (snap.empty) return;
          const msgDoc = snap.docs[0];
          const msgId = msgDoc.id;
          const data: any = msgDoc.data();
          
          // Skip if this is the initial load for this event
          if (!initialLoadRef.current[ev.id]) {
            initialLoadRef.current[ev.id] = true;
            lastMsgIdRef.current[ev.id] = msgId;
            return;
          }
          
          // Skip if we already notified about this message
          if (lastMsgIdRef.current[ev.id] === msgId) {
            return;
          }
          
          // Skip if it's our own message
          if (data?.userId === currentUserId) {
            lastMsgIdRef.current[ev.id] = msgId;
            return;
          }
          
          // Skip if user is currently viewing this chat
          if (getCurrentViewingEvent() === ev.id) {
            lastMsgIdRef.current[ev.id] = msgId;
            return;
          }
          
          // Update tracked message and show notification
          lastMsgIdRef.current[ev.id] = msgId;
          presentLocalNotification(
            ev.title || 'Nowa wiadomość', 
            data?.text || 'Nowa wiadomość',
            ev.id
          );
        });
        messageUnsubsRef.current[ev.id] = unsub;
      } catch (e) {
        // ignore
      }
    });

    return () => {
      Object.values(messageUnsubsRef.current).forEach(u => u && u());
      messageUnsubsRef.current = {};
    };
  }, [events]);

    useEffect(() => {
    if (viewMode === 'map' && userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 500);
    }
  }, [viewMode, userLocation]);

  const fetchEvents = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'events'));
      const data: EventItem[] = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          title: d.title || '',
          description: d.description || '',
          category: d.category || '',
          date: d.date || '',
          time: d.time || '',
          address: d.address || '',
          location: d.location || { latitude: 0, longitude: 0 },
          userId: d.userId || '',
          createdAt: d.createdAt || '',
          participants: d.participants || [],
        };
      });
      setEvents(data);
    } catch (error: any) {
      console.error('Błąd podczas pobierania wydarzeń:', error);
      Alert.alert('Błąd pobierania wydarzeń', firebaseErrorMessage(error));
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

  // Register for local notifications on mount
  useEffect(() => {
    (async () => {
      await registerForNotifications();
    })();
  }, []);

  const filterAndSortEvents = useCallback(() => {
    let data = [...events];

    // Filtruj wydarzenia po dacie (nie pokazuj przeszłych)
    const today = new Date().toISOString().split('T')[0];
    data = data.filter((e) => e.date >= today);

    if (categoryFilter) {
      data = data.filter((e) =>
        e.category.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    if (dateFilter) {
      const selectedDate = dateFilter.toISOString().split('T')[0];
      data = data.filter((e) => e.date === selectedDate);
    }

    if (distanceFilter && userLocation) {
      data = data.filter((e) => {
        if (!e.location) return false;
        const R = 6371; // km
        const dLat = (e.location.latitude - userLocation.latitude) * Math.PI / 180;
        const dLon = (e.location.longitude - userLocation.longitude) * Math.PI / 180;
        const lat1 = userLocation.latitude * Math.PI / 180;
        const lat2 = e.location.latitude * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        return distance <= distanceFilter;
      });
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
      data.sort((a, b) => {
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bCreated - aCreated;
      });
    }

    setFilteredEvents(data);
  }, [events, categoryFilter, dateFilter, sortOption, userLocation, distanceFilter]);

  const computeFilteredList = useCallback((
    evts: EventItem[],
    cat: EventCategory | '' ,
    dateF: Date | null,
    sortOpt: string | null,
    distFilter: number | null,
    uLoc: { latitude: number; longitude: number } | null
  ) => {
    let data = [...evts];
    const today = new Date().toISOString().split('T')[0];
    data = data.filter((e) => e.date >= today);

    if (cat) {
      data = data.filter((e) => e.category.toLowerCase().includes(cat.toLowerCase()));
    }

    if (dateF) {
      const selectedDate = dateF.toISOString().split('T')[0];
      data = data.filter((e) => e.date === selectedDate);
    }

    if (distFilter && uLoc) {
      data = data.filter((e) => {
        if (!e.location) return false;
        const R = 6371; // km
        const dLat = (e.location.latitude - uLoc.latitude) * Math.PI / 180;
        const dLon = (e.location.longitude - uLoc.longitude) * Math.PI / 180;
        const lat1 = uLoc.latitude * Math.PI / 180;
        const lat2 = e.location.latitude * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        return distance <= distFilter;
      });
    }

    if (sortOpt === 'nearest' && uLoc) {
      data.sort((a, b) => {
        const distA = Math.sqrt(
          Math.pow(a.location.latitude - uLoc.latitude, 2) + Math.pow(a.location.longitude - uLoc.longitude, 2)
        );
        const distB = Math.sqrt(
          Math.pow(b.location.latitude - uLoc.latitude, 2) + Math.pow(b.location.longitude - uLoc.longitude, 2)
        );
        return distA - distB;
      });
    }

    if (sortOpt === 'latest') {
      data.sort((a, b) => {
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bCreated - aCreated;
      });
    }

    return data;
  }, []);

  // Ile wydarzeń spełniłoby obecne (pending) kryteria — używane do etykiety przycisku
  const pendingFilteredCount = useMemo(() => {
    return computeFilteredList(events, pendingCategoryFilter, pendingDateFilter, pendingSortOption, pendingDistanceFilter, userLocation).length;
  }, [events, pendingCategoryFilter, pendingDateFilter, pendingSortOption, pendingDistanceFilter, userLocation, computeFilteredList]);


  useEffect(() => {
    fetchLocation();
  }, []);

  // Odświeżaj listę przy pierwszym wejściu i po powrocie z parametrem refresh
  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [params.refresh])
  );

  // Jeśli wróciliśmy z parametrem ?refresh (np. po utworzeniu wydarzenia), pobierz listę i usuń parametr
  useEffect(() => {
    if (params?.refresh) {
      fetchEvents();
      try {
        // wyczyść parametr, żeby nie odświeżać w kółko
        router.replace({ pathname: '/', params: {} });
      } catch (e) {
        // ignore router replace errors
      }
    }
  }, [params?.refresh]);

  // Odpal filtr/sortowanie przy zmianie wydarzeń lub dowolnego filtra (w tym distance/userLocation)
  useEffect(() => {
    filterAndSortEvents();
  }, [events, categoryFilter, dateFilter, sortOption, distanceFilter, userLocation]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents().finally(() => setRefreshing(false));
  }, []);

  const handleMarkerPress = (event: EventItem, index: number) => {
    setSelectedEvent(event);
    setSelectedEventIndex(index);
  };

  const toggleJoinEvent = async (eventId: string, joined: boolean) => {
    const user = auth.currentUser;
    if (!user) {
      router.push('/AuthScreen');
      return;
    }
    try {
      const eventRef = doc(db, 'events', eventId);
      const userRef = doc(db, 'users', user.uid);
      if (!joined) {
        await updateDoc(eventRef, { participants: arrayUnion(user.uid) });
        // schedule 24h reminder for this event if we have its data
        const ev = events.find(e => e.id === eventId);
        if (ev) {
          // combine date and time into ISO string (assume local timezone)
          const iso = ev.date + 'T' + (ev.time || '00:00') + ':00';
          scheduleEventReminder(eventId, ev.title || 'Wydarzenie', iso);
        }
        await updateDoc(userRef, { joinedEvents: arrayUnion(eventId) });
      } else {
        await updateDoc(eventRef, { participants: arrayRemove(user.uid) });
        // cancel reminder
        cancelEventReminder(eventId);
        await updateDoc(userRef, { joinedEvents: arrayRemove(eventId) });
      }
      await fetchEvents();
    } catch (e: any) {
      console.error('Join error', e);
      alert(firebaseErrorMessage(e));
    }
  };

  const resetFilters = () => {
    setCategoryFilter('');
    setDateFilter(null);
    setSortOption(null);
    setDistanceFilter(null);
    // gdy resetujemy, zresetuj też pending (w modal)
    setPendingCategoryFilter('');
    setPendingDateFilter(null);
    setPendingSortOption(null);
    setPendingDistanceFilter(null);
    setFilterModalVisible(false);
  };

  const resetPendingFilters = () => {
    setPendingCategoryFilter('');
    setPendingDateFilter(null);
    setPendingSortOption(null);
    setPendingDistanceFilter(null);
  };

  const renderActiveFilters = () => {
    const chips: JSX.Element[] = [];
    if (categoryFilter) chips.push(
      <View key="cat" style={styles.chip}>
        <Text style={styles.chipText}>{`Kategoria: ${categoryFilter}`}</Text>
        <Pressable onPress={() => removeFilter('category')} style={styles.chipClose}>
          <Ionicons name="close" size={14} color="#4E6EF2" />
        </Pressable>
      </View>
    );
    if (dateFilter) chips.push(
      <View key="date" style={styles.chip}>
        <Text style={styles.chipText}>{`Data: ${dateFilter.toISOString().split('T')[0]}`}</Text>
        <Pressable onPress={() => removeFilter('date')} style={styles.chipClose}>
          <Ionicons name="close" size={14} color="#4E6EF2" />
        </Pressable>
      </View>
    );
    if (sortOption === 'nearest') chips.push(
      <View key="sort-nearest" style={styles.chip}>
        <Text style={styles.chipText}>Najbliższe</Text>
        <Pressable onPress={() => removeFilter('sort')} style={styles.chipClose}>
          <Ionicons name="close" size={14} color="#4E6EF2" />
        </Pressable>
      </View>
    );
    if (sortOption === 'latest') chips.push(
      <View key="sort-latest" style={styles.chip}>
        <Text style={styles.chipText}>Najnowsze</Text>
        <Pressable onPress={() => removeFilter('sort')} style={styles.chipClose}>
          <Ionicons name="close" size={14} color="#4E6EF2" />
        </Pressable>
      </View>
    );
    if (distanceFilter) chips.push(
      <View key="dist" style={styles.chip}>
        <Text style={styles.chipText}>{`Odległość: ${distanceFilter} km`}</Text>
        <Pressable onPress={() => removeFilter('distance')} style={styles.chipClose}>
          <Ionicons name="close" size={14} color="#4E6EF2" />
        </Pressable>
      </View>
    );

    if (chips.length === 0) return null;
    return chips;
  };

  // Usuwa konkretny filtr i od razu odświeża widok listy
  const removeFilter = (which: 'category' | 'date' | 'sort' | 'distance') => {
    let newCategory = categoryFilter;
    let newDate = dateFilter;
    let newSort = sortOption;
    let newDist = distanceFilter;

    if (which === 'category') newCategory = '';
    if (which === 'date') newDate = null;
    if (which === 'sort') newSort = null;
    if (which === 'distance') newDist = null;

    // Zaktualizuj stany
    setCategoryFilter(newCategory);
    setDateFilter(newDate);
    setSortOption(newSort);
    setDistanceFilter(newDist);

    // Zaktualizuj też pending, żeby modal pozostał spójny
    setPendingCategoryFilter(newCategory);
    setPendingDateFilter(newDate);
    setPendingSortOption(newSort);
    setPendingDistanceFilter(newDist);

    // Oblicz i ustaw od razu przefiltrowaną listę
    const newData = computeFilteredList(events, newCategory, newDate, newSort, newDist, userLocation);
    setFilteredEvents(newData);
  };

  const renderListView = () => (
    <FlatList
      data={filteredEvents}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => {
        let distanceText = '';
        if (userLocation && item.location) {
          const R = 6371; // km
          const dLat = (item.location.latitude - userLocation.latitude) * Math.PI / 180;
          const dLon = (item.location.longitude - userLocation.longitude) * Math.PI / 180;
          const lat1 = userLocation.latitude * Math.PI / 180;
          const lat2 = item.location.latitude * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          distanceText = `• ${distance.toFixed(1)} km od Ciebie`;
        }

        // Oblicz ile czasu temu utworzono wydarzenie
        let createdText = '';
        if (item.createdAt) {
          const createdDate = new Date(item.createdAt);
          const now = new Date();
          const diffMs = now.getTime() - createdDate.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          if (diffDays > 0) createdText = `dodano ${diffDays} dni temu`;
          else if (diffHours > 0) createdText = `dodano ${diffHours} godz. temu`;
          else createdText = `dodano ${diffMinutes} min temu`;
        }

        const today = new Date().toISOString().split('T')[0];
        const isPast = item.date && item.date < today;

        return (
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
                  userId: item.userId,
                },
              })
            }
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.info}>{item.description}</Text>
            <Text style={styles.detail}>📍 {item.address || 'Brak adresu'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={[styles.detail, { flex: 1 }]}>📅 {item.date} ⏰ {item.time}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>{item.category}</Text>
                </View>
                <View style={styles.participantsInline}>
                  <Ionicons name="person" size={14} color="#666" />
                  <Text style={styles.participantsText}>{(item.participants || []).length}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.detail}>{createdText} {distanceText}</Text>
          </Pressable>
        );
      }}
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );



  const renderMapView = () => (
    <View style={styles.mapContainer}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={userLocation ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        } : undefined}
        showsUserLocation={true}
      >
        {/* Okrąg zasięgu */}
        {userLocation && distanceFilter && (
          <Circle
            center={userLocation}
            radius={distanceFilter * 1000}
            strokeColor="#4E6EF2"
            fillColor="rgba(78,110,242,0.1)"
          />
        )}
        {filteredEvents.map((event, index) => (
          <Marker
            key={event.id}
            coordinate={event.location}
            onPress={() => handleMarkerPress(event, index)}
          >
          </Marker>
        ))}
      </MapView>
      {selectedEvent && selectedEventIndex !== null && (
        <PopupWithSwipe
          selectedEvent={selectedEvent}
          selectedEventIndex={selectedEventIndex}
          filteredEvents={filteredEvents}
          userLocation={userLocation}
          setSelectedEvent={setSelectedEvent}
          setSelectedEventIndex={setSelectedEventIndex}
          router={router}
          mapRef={mapRef}
        />
      )}
    </View>
  );

function PopupWithSwipe({
  selectedEvent,
  selectedEventIndex,
  filteredEvents,
  userLocation,
  setSelectedEvent,
  setSelectedEventIndex,
  router,
  mapRef
}: {
  selectedEvent: EventItem,
  selectedEventIndex: number,
  filteredEvents: EventItem[],
  userLocation: { latitude: number; longitude: number } | null,
  setSelectedEvent: (e: EventItem | null) => void,
  setSelectedEventIndex: (i: number | null) => void,
  router: any,
  mapRef?: React.RefObject<MapView>
}) {
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 20,
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx < -40 && selectedEventIndex < filteredEvents.length - 1) {
        const nextEvent = filteredEvents[selectedEventIndex + 1];
        setSelectedEvent(nextEvent);
        setSelectedEventIndex(selectedEventIndex + 1);
        // Centrowanie mapy na kolejnym wydarzeniu
        if (mapRef && mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: nextEvent.location.latitude,
            longitude: nextEvent.location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 500);
        }
      } else if (gestureState.dx > 40 && selectedEventIndex > 0) {
        const prevEvent = filteredEvents[selectedEventIndex - 1];
        setSelectedEvent(prevEvent);
        setSelectedEventIndex(selectedEventIndex - 1);
        // Centrowanie mapy na poprzednim wydarzeniu
        if (mapRef && mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: prevEvent.location.latitude,
            longitude: prevEvent.location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 500);
        }
      }
    },
  });
  // Calculate distance and time since added
  let distanceText = '';
  if (userLocation && selectedEvent.location) {
    const R = 6371;
    const dLat = (selectedEvent.location.latitude - userLocation.latitude) * Math.PI / 180;
    const dLon = (selectedEvent.location.longitude - userLocation.longitude) * Math.PI / 180;
    const lat1 = userLocation.latitude * Math.PI / 180;
    const lat2 = selectedEvent.location.latitude * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    distanceText = `• ${distance.toFixed(1)} km od Ciebie`;
  }
  let createdText = '';
  if (selectedEvent.createdAt) {
    const createdDate = new Date(selectedEvent.createdAt);
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
    <View
      style={styles.popup}
      {...panResponder.panHandlers}
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          setSelectedEvent(null);
          setSelectedEventIndex(null);
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
              userId: selectedEvent.userId,
            },
          });
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
          <Text style={[styles.popupTitle, { marginBottom: 0 }]}>{selectedEvent.title}</Text>
        </View>
        <Text style={styles.popupInfo}>📍 {selectedEvent.address || 'Brak adresu'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={styles.popupInfo}>📅 {selectedEvent.date} ⏰ {selectedEvent.time}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{selectedEvent.category}</Text>
            </View>
            <View style={styles.participantsInline}>
              <Ionicons name="person" size={14} color="#666" />
              <Text style={styles.participantsText}>{(selectedEvent.participants || []).length}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.popupInfo}>{createdText} {distanceText}</Text>
      </Pressable>
    </View>
  );
}
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logo}>NearUp</Text>

      <View style={styles.headerRow}>
        <Text style={styles.subheader}>Znajdź wydarzenia dla Siebie</Text>
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

      <View style={styles.filtersRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContent}
          style={styles.chipsContainer}
        >
          {renderActiveFilters()}
        </ScrollView>
        <Pressable onPress={() => setFilterModalVisible(true)} style={styles.filterButton}>
          <Ionicons name="options" size={20} color="#fff" />
          <Text style={{ color: '#fff', marginLeft: 6 }}>Filtruj</Text>
        </Pressable>
      </View>

      {viewMode === 'list' ? renderListView() : renderMapView()}

      {viewMode !== 'map' && (
        <Pressable style={styles.addButton} onPress={() => router.push('/CreateEvent')}>
          <Ionicons name="add" size={32} color="white" />
        </Pressable>
      )}

      <Modal visible={filterModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Filtry</Text>
            <Pressable onPress={() => setFilterModalVisible(false)} style={{ position: 'absolute', top: 12, right: 12 }}>
              <Ionicons name="close" size={20} color="#666" />
            </Pressable>
            <CategorySelector
              selected={pendingCategoryFilter}
              onChange={(val) => setPendingCategoryFilter(typeof val === 'string' ? val : '')}
              label="Kategoria"
              mode="single"
              containerStyle={{ marginTop: 10, marginBottom: 12 }}
            />
            <Text style={{ marginTop: 10 }}>Kiedy</Text>
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.input}>
              <Text>{pendingDateFilter ? pendingDateFilter.toDateString() : 'Wybierz datę'}</Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={pendingDateFilter || new Date()}
                mode="date"
                display="default"
                onChange={(e, selectedDate) => {
                  setShowDatePicker(false);
                  const dismissed = (
                    (typeof e === 'object' && e != null && (e as any).type === 'dismissed') ||
                    (typeof e === 'string' && e === 'dismissed')
                  );
                  if (dismissed) return;
                  if (selectedDate) setPendingDateFilter(selectedDate);
                }}
              />
            )}

            <Text style={{ marginTop: 10 }}>Odległość (km):</Text>
            <View style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginTop: 6 }}>
              <Picker
                selectedValue={pendingDistanceFilter === null ? 'unlimited' : pendingDistanceFilter.toString()}
                onValueChange={(itemValue) => {
                  if (itemValue === 'unlimited') {
                    setPendingDistanceFilter(null);
                  } else {
                    const val = Number(itemValue);
                    setPendingDistanceFilter(val);
                    if (!userLocation) {
                      fetchLocation();
                    }
                  }
                }}>
                <Picker.Item label="Bez limitu" value="unlimited" />
                <Picker.Item label="5 km" value="5" />
                <Picker.Item label="10 km" value="10" />
                <Picker.Item label="15 km" value="15" />
                <Picker.Item label="20 km" value="20" />
                <Picker.Item label="50 km" value="50" />
              </Picker>
            </View>

            <Text style={{ marginTop: 10 }}>Sortowanie:</Text>
            <View style={styles.sortButtons}>
              <Pressable
                onPress={() => setPendingSortOption('nearest')}
                style={[styles.sortOption, pendingSortOption === 'nearest' && styles.activeSort]}
              >
                <Text style={[styles.sortText, pendingSortOption === 'nearest' && styles.sortTextActive]}>Najbliższe</Text>
              </Pressable>
              <Pressable
                onPress={() => setPendingSortOption('latest')}
                style={[styles.sortOption, pendingSortOption === 'latest' && styles.activeSort]}
              >
                <Text style={[styles.sortText, pendingSortOption === 'latest' && styles.sortTextActive]}>Najnowsze</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable onPress={() => { resetPendingFilters(); }} style={styles.resetButton}>
                <Text style={{ color: '#4E6EF2' }}>Resetuj</Text>
              </Pressable>
              <Pressable onPress={() => {
                const newData = computeFilteredList(events, pendingCategoryFilter, pendingDateFilter, pendingSortOption, pendingDistanceFilter, userLocation);
                setFilteredEvents(newData);
                setCategoryFilter(pendingCategoryFilter);
                setDateFilter(pendingDateFilter);
                setSortOption(pendingSortOption);
                setDistanceFilter(pendingDistanceFilter);
                setFilterModalVisible(false);
              }} style={styles.confirmButton}>
                <Text style={{ color: '#fff' }}>{`Pokaż (${pendingFilteredCount})`}</Text>
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
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 10,
    gap: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    marginRight: 8,
  },
  chipsScrollContent: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef1ff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    marginRight: 8,
  },
  chipText: {
    color: '#4E6EF2',
    marginRight: 6,
    fontSize: 13,
  },
  chipClose: {
    padding: 4,
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
  categoryPill: {
    backgroundColor: '#eef1ff',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  categoryPillText: {
    color: '#4E6EF2',
    fontSize: 13,
    fontWeight: '600',
  },
  participantsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  participantsText: {
    color: '#666',
    marginLeft: 6,
    fontSize: 13,
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
    textAlign: 'center',
  },
  popupCategory: {
    marginTop: 8,
    fontStyle: 'italic',
    color: '#888',
    textAlign: 'center',
    fontSize: 15,
    marginBottom: 2,
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
    backgroundColor: '#fff',
    marginRight: 8,
  },
  activeSort: {
    backgroundColor: '#4E6EF2',
  },
  sortText: {
    color: '#4E6EF2',
    fontWeight: '600',
  },
  sortTextActive: {
    color: '#fff',
    fontWeight: '700',
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
