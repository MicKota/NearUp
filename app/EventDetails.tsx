
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';

export default function EventDetails() {
  const { title, description, address, category, date, time, latitude, longitude } = useLocalSearchParams();

  const parsedLat = latitude ? parseFloat(latitude as string) : null;
  const parsedLng = longitude ? parseFloat(longitude as string) : null;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.logo}>NearUp</Text>
      <Text style={styles.subheader}>Szczegóły wydarzenia</Text>

      <Text style={styles.title}>{title}</Text>

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
