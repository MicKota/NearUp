import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { db, auth } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

type Conversation = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  lastMessage?: string;
  lastMessageTime?: string;
  participantsCount: number;
};

export default function Chats() {
  const router = useRouter();
  const user = auth.currentUser;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!user) {
        router.replace('/AuthScreen');
        return;
      }

      try {
        // Pobierz wszystkie wydarzenia do których użytkownik dołączył
        const eventsQuery = query(
          collection(db, 'events'),
          where('participants', 'array-contains', user.uid)
        );
        const eventsSnap = await getDocs(eventsQuery);
        
        const convs: Conversation[] = [];
        
        for (const eventDoc of eventsSnap.docs) {
          const eventData = eventDoc.data();
          convs.push({
            eventId: eventDoc.id,
            eventTitle: eventData.title || 'Brak nazwy',
            eventDate: eventData.date || '',
            participantsCount: (eventData.participants || []).length,
            lastMessage: undefined,
            lastMessageTime: undefined,
          });
        }
        
        setConversations(convs);
      } catch (error) {
        console.error('Błąd pobierania rozmów:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [user]);

  if (!user) return null;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4E6EF2" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Czaty grupowe</Text>
      {conversations.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Nie dołączyłeś jeszcze do żadnych wydarzeń</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.eventId}
          renderItem={({ item }) => (
            <Pressable
              style={styles.conversationCard}
              onPress={() => router.push(`/GroupChat?eventId=${item.eventId}`)}
            >
              <View style={styles.conversationContent}>
                <Text style={styles.conversationTitle}>{item.eventTitle}</Text>
                <Text style={styles.conversationDate}>📅 {item.eventDate}</Text>
                <Text style={styles.participantsCount}>
                  <Ionicons name="people" size={14} color="#666" /> {item.participantsCount} uczestników
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#4E6EF2" />
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4E6EF2',
    padding: 20,
    paddingBottom: 10,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  conversationContent: {
    flex: 1,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  conversationDate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  participantsCount: {
    fontSize: 13,
    color: '#666',
  },
});
