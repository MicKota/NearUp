import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, SafeAreaView, RefreshControl, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { db, auth } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

type Conversation = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  lastMessage?: string;
  lastMessageAuthor?: string;
  lastMessageTime?: string;
  lastMessageTimestamp?: number;
  participantsCount: number;
  unreadCount: number;
};

export default function Chats() {
  const router = useRouter();
  const user = auth.currentUser;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pastConversations, setPastConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
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
        
        // Pobierz ostatnią wiadomość
        let lastMessage: string | undefined;
        let lastMessageAuthor: string | undefined;
        let lastMessageTime: string | undefined;
        let lastMessageTimestamp: number | undefined;
        
        try {
          const messagesQuery = query(
            collection(db, 'events', eventDoc.id, 'messages'),
            orderBy('timestamp', 'desc'),
            limit(1)
          );
          const messagesSnap = await getDocs(messagesQuery);
          
          if (!messagesSnap.empty) {
            const lastMsgDoc = messagesSnap.docs[0];
            const lastMsg = lastMsgDoc.data();
            lastMessage = lastMsg.text;
            // store localized time for display and raw timestamp for sorting
            lastMessageTime = lastMsg.timestamp?.toDate().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
            lastMessageTimestamp = lastMsg.timestamp?.toMillis ? lastMsg.timestamp.toMillis() : (lastMsg.timestamp ? new Date(lastMsg.timestamp).getTime() : undefined);
            
            // Pobierz nick autora (preferuj `nick` zamiast email)
            if (lastMsg.userId) {
              const userDoc = await getDoc(doc(db, 'users', lastMsg.userId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                lastMessageAuthor = userData?.nick || userData?.displayName || userData?.email || 'Nieznany';
              }
            }
          }
        } catch (err) {
          console.error('Błąd pobierania ostatniej wiadomości:', err);
        }
        
        // Policz nieprzeczytane wiadomości (filter client-side by userId when needed)
        let unreadCount = 0;
        try {
          const readStatusDoc = await getDoc(doc(db, 'events', eventDoc.id, 'readStatus', user.uid));
          const lastReadTimestamp = readStatusDoc.exists() ? readStatusDoc.data()?.lastReadTimestamp : null;

          if (lastReadTimestamp) {
            // pobierz wiadomości po lastReadTimestamp, policz te, które nie są od nas
            const msgsAfterQuery = query(
              collection(db, 'events', eventDoc.id, 'messages'),
              where('timestamp', '>', lastReadTimestamp),
              orderBy('timestamp', 'asc')
            );
            const msgsSnap = await getDocs(msgsAfterQuery);
            unreadCount = msgsSnap.docs.filter(d => d.data()?.userId !== user.uid).length;
          } else {
            // brak zapisu - zlicz wszystkie wiadomości nieod nas
            const msgsQuery = query(
              collection(db, 'events', eventDoc.id, 'messages'),
              where('userId', '!=', user.uid)
            );
            const msgsSnap = await getDocs(msgsQuery);
            unreadCount = msgsSnap.size;
          }
        } catch (err) {
          console.error('Błąd liczenia nieprzeczytanych:', err);
        }
        
        convs.push({
          eventId: eventDoc.id,
          eventTitle: eventData.title || 'Brak nazwy',
          eventDate: eventData.date || '',
          participantsCount: (eventData.participants || []).length,
          lastMessage,
          lastMessageAuthor,
          lastMessageTime,
          lastMessageTimestamp,
          unreadCount,
        });
      }
      
      // split into active vs past (based on eventDate) and sort each by lastMessageTimestamp desc
      const active: Conversation[] = [];
      const past: Conversation[] = [];
      const now = new Date();
      for (const c of convs) {
        const d = new Date(c.eventDate);
        if (!isNaN(d.getTime()) && d < now) past.push(c);
        else active.push(c);
      }

      const sortByTimeDesc = (arr: Conversation[]) => arr.sort((a, b) => (b.lastMessageTimestamp ?? 0) - (a.lastMessageTimestamp ?? 0));
      sortByTimeDesc(active);
      sortByTimeDesc(past);

      setConversations(active);
      setPastConversations(past);
    } catch (error) {
      console.error('Błąd pobierania rozmów:', error);
    } finally {
      setLoading(false);
    }
  }, [user, router]);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      fetchConversations();
    }
  }, [isFocused, fetchConversations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchConversations().finally(() => setRefreshing(false));
  }, [fetchConversations]);

  const renderConversationCard = (item: Conversation) => (
    <Pressable
      style={[
        styles.conversationCard,
        item.unreadCount > 0 && styles.conversationCardUnread,
      ]}
      onPress={() => router.push(`/GroupChat?eventId=${item.eventId}`)}
    >
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={[
            styles.conversationTitle,
            item.unreadCount > 0 && styles.conversationTitleUnread,
          ]}>
            {item.eventTitle}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.conversationDate}>📅 {item.eventDate}</Text>
          <Text style={styles.participantsCount}>
            <Ionicons name="people" size={14} color="#666" /> {item.participantsCount}
          </Text>
        </View>
        {item.lastMessage && (
          <Text style={[
            styles.lastMessage,
            item.unreadCount > 0 && styles.lastMessageUnread,
          ]} numberOfLines={1}>
            {item.lastMessageAuthor && `${item.lastMessageAuthor}: `}
            {item.lastMessage}
            {item.lastMessageTime ? ` · ${item.lastMessageTime}` : ''}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#4E6EF2" />
    </Pressable>
  );

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
        <ScrollView contentContainerStyle={styles.centerContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <Text style={styles.emptyText}>Nie dołączyłeś jeszcze do żadnych wydarzeń</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.eventId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.conversationCard,
                item.unreadCount > 0 && styles.conversationCardUnread
              ]}
              onPress={() => router.push(`/GroupChat?eventId=${item.eventId}`)}
            >
              <View style={styles.conversationContent}>
                <View style={styles.conversationHeader}>
                  <Text style={[
                    styles.conversationTitle,
                    item.unreadCount > 0 && styles.conversationTitleUnread
                  ]}>
                    {item.eventTitle}
                  </Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.conversationDate}>📅 {item.eventDate}</Text>
                  <Text style={styles.participantsCount}>
                    <Ionicons name="people" size={14} color="#666" /> {item.participantsCount}
                  </Text>
                </View>
                {item.lastMessage && (
                  <Text style={[
                    styles.lastMessage,
                    item.unreadCount > 0 && styles.lastMessageUnread
                  ]} numberOfLines={1}>
                    {item.lastMessageAuthor && `${item.lastMessageAuthor}: `}
                    {item.lastMessage}
                    {item.lastMessageTime ? ` · ${item.lastMessageTime}` : ''}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#4E6EF2" />
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
      {/* Archive (past events) toggle */}
      <View style={styles.archiveContainer}>
        <Pressable style={styles.archiveHeader} onPress={() => setArchiveOpen((s) => !s)}>
          <Text style={styles.archiveTitle}>Zakończone wydarzenia ({pastConversations.length})</Text>
          <Ionicons name={archiveOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#666" />
        </Pressable>
        {archiveOpen && pastConversations.length > 0 && (
          <View style={styles.archiveList}>
            {pastConversations.map((p) => (
              <View key={p.eventId} style={{ marginBottom: 8 }}>
                {renderConversationCard(p)}
              </View>
            ))}
          </View>
        )}
      </View>
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
    paddingTop: 30,
    paddingHorizontal: 20,
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
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  conversationCardUnread: {
    backgroundColor: '#EEF2FF',
    borderLeftWidth: 4,
    borderLeftColor: '#4E6EF2',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  conversationTitleUnread: {
    fontWeight: '700',
    color: '#000',
  },
  conversationDate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 0,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  lastMessage: {
    fontSize: 13,
    color: '#888',
    marginBottom: 6,
  },
  lastMessageUnread: {
    fontWeight: '600',
    color: '#555',
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantsCount: {
    fontSize: 13,
    color: '#666',
  },
  lastMessageTime: {
    fontSize: 12,
    color: '#999',
  },
  unreadBadge: {
    backgroundColor: '#4E6EF2',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  archiveContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  archiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  archiveTitle: { fontSize: 15, color: '#444', fontWeight: '600' },
  archiveList: { marginTop: 8 },
});
