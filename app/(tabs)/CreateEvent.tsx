import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  StatusBar,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function CreateEvent() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [category, setCategory] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Reverse geocoding po kliknięciu na mapę
  const handleMapPress = async (e: MapPressEvent) => {
    const coords = e.nativeEvent.coordinate;
    setLocation(coords);
    setIsGeocoding(true);
    try {
      const [geo] = await Location.reverseGeocodeAsync(coords);
      if (geo) {
        const addr = `${geo.street || ''} ${geo.name || ''}, ${geo.postalCode || ''} ${geo.city || geo.district || ''}`.trim();
        setAddress(addr);
        setAddressInput(addr);
      } else {
        setAddress('Nieznany adres');
        setAddressInput('');
      }
    } catch (err) {
      setAddress('Błąd pobierania adresu');
      setAddressInput('');
    }
    setIsGeocoding(false);
  };

  // Geocoding po wpisaniu adresu
  const handleAddressSearch = async () => {
    if (!addressInput.trim()) return;
    setIsGeocoding(true);
    try {
      const results = await Location.geocodeAsync(addressInput);
      if (results && results.length > 0) {
        const coords = { latitude: results[0].latitude, longitude: results[0].longitude };
        setLocation(coords);
        setAddress(addressInput);
      } else {
        Alert.alert('Nie znaleziono lokalizacji dla podanego adresu.');
      }
    } catch (err) {
      Alert.alert('Błąd podczas wyszukiwania adresu.');
    }
    setIsGeocoding(false);
  };

  const handleSubmit = async () => {
    if (!title || !description || !location || !address || !category || !date || !time) {
      Alert.alert('Uzupełnij wszystkie pola');
      return;
    }

    try {
      await addDoc(collection(db, 'events'), {
        title,
        description,
        location, // współrzędne dla serwera
        address,   // adres dla użytkownika
        category,
        date: date.toISOString().split('T')[0],
        time: time.toTimeString().split(' ')[0].slice(0, 5),
      });

      Alert.alert('Wydarzenie utworzone!');
      // Przekaż parametr do routera, aby wymusić odświeżenie listy
      router.push({ pathname: '/', params: { refresh: '1' } });
    } catch (error) {
      console.error('Błąd podczas zapisu:', error);
      Alert.alert('Błąd podczas zapisywania wydarzenia.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.logo}>NearUp</Text>
      <Text style={styles.subheader}>Utwórz nowe wydarzenie</Text>

      <TextInput
        style={styles.input}
        placeholder="Tytuł"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Opis"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Kategoria:</Text>
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={category}
          onValueChange={(itemValue) => setCategory(itemValue)}
        >
          <Picker.Item label="Wybierz kategorię" value="" />
          <Picker.Item label="Koncert" value="Koncert" />
          <Picker.Item label="Sport" value="Sport" />
          <Picker.Item label="Kultura" value="Kultura" />
          <Picker.Item label="Inne" value="Inne" />
        </Picker>
      </View>

      <Text style={styles.label}>Data wydarzenia:</Text>
      <Pressable onPress={() => setShowDatePicker(true)} style={styles.pickerButton}>
        <Text style={styles.pickerText}>
          {date ? date.toISOString().split('T')[0] : 'Wybierz datę'}
        </Text>
      </Pressable>
      {showDatePicker && (
        <DateTimePicker
          value={date || new Date()}
          mode="date"
          display="default"
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDate(selectedDate);
          }}
        />
      )}

      <Text style={styles.label}>Godzina wydarzenia:</Text>
      <Pressable onPress={() => setShowTimePicker(true)} style={styles.pickerButton}>
        <Text style={styles.pickerText}>
          {time ? time.toTimeString().split(' ')[0].slice(0, 5) : 'Wybierz godzinę'}
        </Text>
      </Pressable>
      {showTimePicker && (
        <DateTimePicker
          value={time || new Date()}
          mode="time"
          display="default"
          onChange={(_, selectedTime) => {
            setShowTimePicker(false);
            if (selectedTime) setTime(selectedTime);
          }}
        />
      )}

      <Text style={styles.label}>Adres wydarzenia:</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={[styles.input, { flex: 1, backgroundColor: '#fff', marginBottom: 0 }]}
          value={addressInput}
          placeholder="Wpisz adres lub wybierz na mapie"
          onChangeText={setAddressInput}
          onBlur={handleAddressSearch}
          editable={!isGeocoding}
        />
        <Pressable
          onPress={handleAddressSearch}
          style={{ backgroundColor: '#4E6EF2', padding: 10, borderRadius: 8 }}
          disabled={isGeocoding}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Szukaj</Text>
        </Pressable>
      </View>
      {address && (
        <Text style={{ color: '#4E6EF2', marginBottom: 8, marginTop: 2, fontSize: 13 }}>Wybrany adres: {address}</Text>
      )}

      <Text style={styles.label}>Kliknij na mapie, aby wybrać lokalizację:</Text>
      <MapView
        style={styles.map}
        onPress={handleMapPress}
        initialRegion={{
          latitude: location?.latitude || 52.2297,
          longitude: location?.longitude || 21.0122,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        region={location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : undefined}
      >
        {location && <Marker coordinate={location} />}
      </MapView>

      
      <Button title="Utwórz wydarzenie" onPress={handleSubmit} color="#4E6EF2" />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
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
    marginBottom: 20,
    color: '#444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  label: {
    marginBottom: 6,
    fontSize: 16,
    color: '#333',
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 12,
  },
  pickerButton: {
    padding: 12,
    backgroundColor: '#f2f2f2',
    borderRadius: 8,
    marginBottom: 12,
  },
  pickerText: {
    fontSize: 16,
    color: '#333',
  },
  map: {
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
    marginTop: 8,
  },
});
