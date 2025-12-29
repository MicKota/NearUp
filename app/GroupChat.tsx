import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  updateDoc,
  arrayRemove,
} from 'firebase/firestore';
import { db, auth } from '@/firebase';
import { firebaseErrorMessage } from '../utils/firebaseErrors';
import { useHeaderHeight } from '@react-navigation/elements';

type Message = {
  id: string;
  userId: string;
  userNick: string;
  text: string;
  timestamp?: { seconds: number; nanoseconds: number };
};

type EventData = {
  id: string;
  title: string;
  participants: string[];
  userId: string;
};

type Member = { uid: string; nick: string };

// TypingBubble component: single sequential loop so dots animate one after another.
const TypingBubble: React.FC<{ names: string[]; active: boolean }> = ({ names, active }) => {
  const dot1 = useRef(new Animated.Value(0.2)).current;
  const dot2 = useRef(new Animated.Value(0.2)).current;
  const dot3 = useRef(new Animated.Value(0.2)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const containerOpacity = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    // container fade in/out
    Animated.timing(containerOpacity, { toValue: active ? 1 : 0, duration: 260, useNativeDriver: true }).start();

    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }
    dot1.setValue(0.2);
    dot2.setValue(0.2);
    dot3.setValue(0.2);

    if (active) {
      const pulse = (val: Animated.Value) =>
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: 200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.2, duration: 200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]);

      // Single loop: dot1 -> dot2 -> dot3 -> pause -> repeat
      const loop = Animated.loop(
        Animated.sequence([
          pulse(dot1),
          pulse(dot2),
          pulse(dot3),
          Animated.delay(300),
        ])
      );
      loopRef.current = loop;
      loop.start();
    }

    return () => {
      if (loopRef.current) loopRef.current.stop();
      loopRef.current = null;
    };
  }, [active, dot1, dot2, dot3, containerOpacity]);

  const label = names.length === 1 ? `${names[0]} pisze` : `${names.slice(0, 2).join(', ')} i inni piszą`;
  return (
    <Animated.View style={[styles.typingBubbleRow, { opacity: containerOpacity }]}> 
      <View style={styles.typingBubble}>
        <Text style={styles.typingLabel} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
        <View style={styles.typingDotsRow}>
          <Animated.View style={[styles.typingDot, { opacity: dot1 }]} />
          <Animated.View style={[styles.typingDot, { marginLeft: 6, opacity: dot2 }]} />
          <Animated.View style={[styles.typingDot, { marginLeft: 6, opacity: dot3 }]} />
        </View>
      </View>
    </Animated.View>
  );
};

export default function GroupChat() {
  const params = useLocalSearchParams();
  const eventId = params.eventId as string | undefined;
  const router = useRouter();
  const navigation = useNavigation();
  const user = auth.currentUser;

  const [event, setEvent] = useState<EventData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [membersVisible, setMembersVisible] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const flatListRef = useRef<FlatList | null>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [typingUsers, setTypingUsers] = useState<Member[]>([]);
  // local display state for typing bubble so we can fade out smoothly
  const [displayTypingNames, setDisplayTypingNames] = useState<string[]>([]);
  const [bubbleActive, setBubbleActive] = useState(false);
  const suppressTypingUntilRef = useRef<number>(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const typingActiveRef = useRef(false);
  const heartbeatRef = useRef<number | null>(null);
  const inactivityTimeoutRef = useRef<number | null>(null);

  const membersByIdRef = useRef<Record<string, string>>({});

  const membersById = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.uid] = m.nick;
    });
    membersByIdRef.current = map;
    return map;
  }, [members]);

  useEffect(() => {
    if (!eventId || !user) return;

    let unsubscribeMessages: (() => void) | undefined;
    let didLoad = false;

    const load = async () => {
      try {
        const eventRef = doc(db, 'events', eventId);
        const eventSnap = await getDoc(eventRef);
        const nickMap: Record<string, string> = {};

        if (eventSnap.exists()) {
          const data = eventSnap.data();
          setEvent({
            id: eventSnap.id,
            title: data.title,
            participants: data.participants || [],
            userId: data.userId,
          });

          const memberDetails: Member[] = [];
          for (const participantId of data.participants || []) {
            const userRef = doc(db, 'users', participantId);
            const userSnap = await getDoc(userRef);
            const nick = userSnap.exists() ? userSnap.data().nick || 'Użytkownik' : 'Użytkownik';
            memberDetails.push({ uid: participantId, nick });
            nickMap[participantId] = nick;
          }
          setMembers(memberDetails);
        }

        const messagesQuery = query(
          collection(db, 'events', eventId, 'messages'),
          orderBy('timestamp', 'asc')
        );

        unsubscribeMessages = onSnapshot(messagesQuery, async (snapshot) => {
          const list: Message[] = [];
          for (const msgDoc of snapshot.docs) {
            const data = msgDoc.data();
            // use nickMap from initial load or membersByIdRef
            let userNick = nickMap[data.userId] || membersByIdRef.current[data.userId] || 'Użytkownik';

            if (!userNick || userNick === 'Użytkownik') {
              const userRef = doc(db, 'users', data.userId);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                userNick = userSnap.data().nick || 'Użytkownik';
              }
            }

            list.push({
              id: msgDoc.id,
              userId: data.userId,
              userNick,
              text: data.text,
              timestamp: data.timestamp,
            });
          }
          setMessages(list);
          if (!didLoad) {
            setLoading(false);
            didLoad = true;
          }
        });
      } catch (err: any) {
        console.error('Błąd ładowania czatu:', err);
        Alert.alert('Błąd ładowania czatu', firebaseErrorMessage(err));
        setLoading(false);
      }
    };

    load();

    return () => {
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [eventId, user]);

    // Przy opuszczeniu czatu: oznacz wszystkie wiadomości jako przeczytane dla tego użytkownika
    useEffect(() => {
      return () => {
        if (!eventId || !user) return;
        (async () => {
          try {
            await setDoc(doc(db, 'events', eventId, 'readStatus', user.uid), { lastReadTimestamp: serverTimestamp() }, { merge: true });
          } catch (err) {
            // ignore write errors
          }
        })();
      };
    }, [eventId, user]);

  // Typing presence: subscribe to typing docs
  useEffect(() => {
    if (!eventId || !user) return;
    const typingCol = collection(db, 'events', eventId, 'typing');
    const unsub = onSnapshot(typingCol, (snapshot) => {
      const list: Member[] = [];
      const now = Date.now();
      snapshot.forEach((d) => {
        const data: any = d.data();
        // expect { uid, nick, lastSeen }
        if (data?.uid && data?.lastSeen && now - data.lastSeen <= 6000) {
          if (data.uid !== user.uid) {
            list.push({ uid: data.uid, nick: data.nick || 'Użytkownik' });
          }
        }
      });
      setTypingUsers(list);
    });

    return () => unsub();
  }, [eventId, user]);

  const setTyping = async (typing: boolean) => {
    if (!eventId || !user) return;
    const docRef = doc(db, 'events', eventId, 'typing', user.uid);
    try {
      if (typing) {
        const nick = membersById[user.uid] || (user.displayName ?? 'Ty');
        await setDoc(docRef, { uid: user.uid, nick, lastSeen: Date.now() });
      } else {
        await deleteDoc(docRef);
      }
    } catch (err) {
      // ignore
    }
  };

  const scheduleTyping = () => {
    if (!eventId || !user) return;

    // if not already marked as typing, set initial doc and start heartbeat
    if (!typingActiveRef.current) {
      setTyping(true).catch(() => {});
      typingActiveRef.current = true;
      // heartbeat: update lastSeen every 1500ms
      // @ts-ignore
      heartbeatRef.current = setInterval(() => {
        setTyping(true).catch(() => {});
      }, 1500) as unknown as number;
    }

    // restart inactivity timeout (3s)
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    // @ts-ignore
    inactivityTimeoutRef.current = setTimeout(() => {
      // stop heartbeat and clear typing doc
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current as any);
        heartbeatRef.current = null;
      }
      typingActiveRef.current = false;
      setTyping(false).catch(() => {});
      inactivityTimeoutRef.current = null;
    }, 3000) as unknown as number;
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (!flatListRef.current) return;
    const t = setTimeout(() => {
      try {
        // try scrollToEnd (works on ScrollView-backed lists)
        // @ts-ignore
        if (flatListRef.current?.scrollToEnd) flatListRef.current.scrollToEnd({ animated: true });
        else if (flatListRef.current?.scrollToOffset) {
          const len = messages.length;
          if (len > 0) flatListRef.current.scrollToOffset({ offset: len * 100, animated: true });
        }
      } catch (e) {
        // ignore
      }
    }, 100);
    return () => clearTimeout(t);
  }, [messages]);

  // When messages update, suppress typing indicator briefly (e.g., 3s)
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.id === lastMessageIdRef.current) return;
    lastMessageIdRef.current = last.id;
    // suppress typing display for 3s after a new message arrives
    suppressTypingUntilRef.current = Date.now() + 3000;
  }, [messages]);

  // Scroll to bottom when typing indicator appears (so footer with typing bubble is visible)
  useEffect(() => {
    if (!flatListRef.current) return;
    if (typingUsers.length === 0) return;
    const t = setTimeout(() => {
      try {
        // @ts-ignore
        if (flatListRef.current?.scrollToEnd) flatListRef.current.scrollToEnd({ animated: true });
        else if (flatListRef.current?.scrollToOffset) {
          const len = messages.length;
          if (len > 0) flatListRef.current.scrollToOffset({ offset: len * 100, animated: true });
        }
      } catch (e) {
        // ignore
      }
    }, 120);
    return () => clearTimeout(t);
  }, [typingUsers]);

  // Manage displayTypingNames and bubbleActive to allow fade-out when typing stops
  useEffect(() => {
    let cancel = false;
    let tidyTimeout: number | null = null;

    const now = Date.now();
    const suppressed = now < suppressTypingUntilRef.current;

    const rawNames = typingUsers.map((t) => t.nick);
    const names = suppressed ? [] : rawNames;

    if (names.length > 0) {
      // someone started typing: immediately show bubble and activate animation
      setDisplayTypingNames(names);
      setBubbleActive(true);
      // ensure footer visible
      try {
        // @ts-ignore
        if (flatListRef.current?.scrollToEnd) flatListRef.current.scrollToEnd({ animated: true });
        else if (flatListRef.current?.scrollToOffset) {
          const len = messages.length;
          if (len > 0) flatListRef.current.scrollToOffset({ offset: len * 100, animated: true });
        }
      } catch (e) {}
    } else {
      // nobody typing or suppressed: fade out bubble (deactivate dot animation), then remove after delay
      setBubbleActive(false);
      // keep bubble mounted while it fades out (match container fade duration) then clear names and scroll
      tidyTimeout = setTimeout(() => {
        if (cancel) return;
        setDisplayTypingNames([]);
        // after bubble is gone, scroll to bottom smoothly
        try {
          // @ts-ignore
          if (flatListRef.current?.scrollToEnd) flatListRef.current.scrollToEnd({ animated: true });
          else if (flatListRef.current?.scrollToOffset) {
            const len = messages.length;
            if (len > 0) flatListRef.current.scrollToOffset({ offset: len * 100, animated: true });
          }
        } catch (e) {}
      }, 360) as unknown as number;
    }

    return () => {
      cancel = true;
      if (tidyTimeout) clearTimeout(tidyTimeout as any);
    };
  }, [typingUsers, messages]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: event?.title ?? 'GroupChat',
      headerRight: () => (
        <Pressable onPress={() => setMenuVisible((v) => !v)} style={{ paddingHorizontal: 12 }}>
          <Ionicons name="menu" size={24} color="#4E6EF2" />
        </Pressable>
      ),
    });
  }, [navigation, event?.title]);

  

  const sendMessage = async () => {
    if (!messageText.trim() || !user || !eventId) return;

    try {
      await addDoc(collection(db, 'events', eventId, 'messages'), {
        userId: user.uid,
        text: messageText.trim(),
        timestamp: serverTimestamp(),
      });
      setMessageText('');
      // clear typing status when message is sent
      try {
        await setTyping(false);
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      console.error('Błąd wysyłania wiadomości:', err);
      Alert.alert('Błąd wysyłania wiadomości', firebaseErrorMessage(err));
    }
  };

  const leaveGroup = async () => {
    if (!user || !event) return;

    Alert.alert('Opuść grupę', 'Czy na pewno chcesz opuścić tę grupę?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Opuść',
        style: 'destructive',
        onPress: async () => {
          try {
            const eventRef = doc(db, 'events', event.id);
            await updateDoc(eventRef, { participants: arrayRemove(user.uid) });
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { joinedEvents: arrayRemove(event.id) });
            // clear typing doc before leaving
            try {
              await setTyping(false);
            } catch (e) {}
            router.back();
          } catch (err: any) {
            console.error('Błąd opuszczania grupy:', err);
            Alert.alert('Błąd opuszczania grupy', firebaseErrorMessage(err));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4E6EF2" />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Nie znaleziono wydarzenia</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={'padding'}
        keyboardVerticalOffset={80}
      >
        {menuVisible && (
          <View style={styles.menu}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setMembersVisible(true);
              }}
            >
              <Ionicons name="people" size={20} color="#4E6EF2" />
              <Text style={styles.menuText}>Pokaż wszystkich członków</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push({ pathname: '/EventDetails', params: { id: event.id } });
              }}
            >
              <Ionicons name="information-circle" size={20} color="#4E6EF2" />
              <Text style={styles.menuText}>Przejdź do wydarzenia</Text>
            </Pressable>
            <Pressable
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => {
                setMenuVisible(false);
                leaveGroup();
              }}
            >
              <Ionicons name="exit" size={20} color="#e74c3c" />
              <Text style={[styles.menuText, { color: '#e74c3c' }]}>Opuść grupę</Text>
            </Pressable>
          </View>
        )}

        <FlatList
          ref={(r) => (flatListRef.current = r)}
          data={(() => {
            if (displayTypingNames.length === 0) return messages;
            // append a synthetic typing item so it renders like a normal message
            return [
              ...messages,
              // @ts-ignore - synthetic item
              { id: '__typing__', userId: '__typing__', userNick: '', text: '', timestamp: undefined },
            ];
          })()}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          inverted={false}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
          onLayout={() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }}
          renderItem={({ item }) => {
            if (item.id === '__typing__') {
              return (
                <View style={styles.messageContainer}>
                  <TypingBubble names={displayTypingNames} active={bubbleActive} />
                </View>
              );
            }

            const isOwn = item.userId === user?.uid;
            return (
              <View style={[styles.messageContainer, isOwn && styles.ownMessage]}>
                <View style={[styles.messageBubble, isOwn && styles.ownMessageBubble]}>
                  {!isOwn && <Text style={styles.messageAuthor}>{item.userNick}</Text>}
                  <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>
                    {item.text}
                  </Text>
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.messagesList}
        />

        <View style={[styles.inputContainer, { paddingBottom: Math.max(12, insets.bottom)}]}>
          <TextInput
            style={styles.input}
            placeholder="Napisz wiadomość..."
            value={messageText}
            onChangeText={(text) => {
              setMessageText(text);
              scheduleTyping();
            }}
            multiline
            maxLength={500}
          />
          <Pressable
            style={styles.sendButton}
            onPress={sendMessage}
            disabled={!messageText.trim()}
          >
            <Ionicons
              name="send"
              size={20}
              color={messageText.trim() ? '#4E6EF2' : '#ccc'}
            />
          </Pressable>
        </View>

        <Modal visible={membersVisible} animationType="slide" transparent>
          <SafeAreaView style={styles.modalContainer} edges={['bottom', 'left', 'right']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Członkowie ({members.length})</Text>
              <Pressable onPress={() => setMembersVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </Pressable>
            </View>
            <FlatList
              data={members}
              keyExtractor={(item) => item.uid}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.memberItem}
                  onPress={() => {
                    setMembersVisible(false);
                    router.push({ pathname: '/UserProfile', params: { userId: item.uid } });
                  }}
                >
                  <Ionicons name="person-circle" size={40} color="#4E6EF2" />
                  <Text style={styles.memberNick}>{item.nick}</Text>
                </Pressable>
              )}
              contentContainerStyle={styles.membersList}
            />
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#888' },
  menu: { backgroundColor: '#f9f9f9', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  menuItemDanger: { backgroundColor: '#fff5f5' },
  menuText: { fontSize: 15, color: '#333', fontWeight: '500' },
  messagesList: { paddingHorizontal: 12, paddingVertical: 8},
  messageContainer: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 6 },
  ownMessage: { justifyContent: 'flex-end' },
  messageBubble: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  ownMessageBubble: { backgroundColor: '#4E6EF2' },
  messageAuthor: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 2 },
  messageText: { fontSize: 15, color: '#333' },
  ownMessageText: { color: '#fff' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: { padding: 8 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  membersList: { paddingHorizontal: 16, paddingVertical: 12 },
  
  typingBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  typingBubble: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  typingLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  typingDotsRow: { flexDirection: 'row', alignItems: 'center' },
  typingDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: '#888', opacity: 0.25 },
  
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberNick: { fontSize: 15, color: '#333', fontWeight: '500' },
});
