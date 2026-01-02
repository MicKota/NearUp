import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';

const REMINDER_KEY_PREFIX = 'event_reminder_';

// Expo Go (SDK 53+) has limited notification support — detect and handle gracefully
const isExpoGo = Constants.appOwnership === 'expo';

// Track which chat user is currently viewing (to avoid notification for that chat)
let currentViewingEventId: string | null = null;

export function setCurrentViewingEvent(eventId: string | null) {
  currentViewingEventId = eventId;
}

export function getCurrentViewingEvent() {
  return currentViewingEventId;
}

// Setup notification handler for when user taps a notification
export function setupNotificationResponseHandler() {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { eventId?: string };
    if (data?.eventId) {
      // Navigate to the chat
      router.push({ pathname: '/GroupChat', params: { eventId: data.eventId } });
    }
  });
  return subscription;
}

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForNotifications() {
  if (!Device.isDevice) {
    console.log('Notifications: not a physical device — skipping');
    return false;
  }
  if (isExpoGo) {
    console.log('Notifications: running in Expo Go — limited support, skipping registration');
    return false;
  }
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (e) {
    console.warn('registerForNotifications error', e);
    return false;
  }
}

export async function presentLocalNotification(title: string, body: string, eventId?: string) {
  if (isExpoGo) {
    console.log(`[Notification stub] ${title}: ${body}`);
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: { 
        title, 
        body, 
        sound: 'default',
        data: eventId ? { eventId } : {},
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('presentLocalNotification error', e);
  }
}

export async function scheduleEventReminder(eventId: string, title: string, eventDateIso: string) {
  if (isExpoGo) {
    console.log(`[Reminder stub] Scheduled for ${eventId}: ${title} at ${eventDateIso}`);
    return null;
  }
  try {
    const eventDate = new Date(eventDateIso);
    const remindAt = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
    if (remindAt.getTime() <= Date.now()) return null; // too late

    const seconds = Math.ceil((remindAt.getTime() - Date.now()) / 1000);
    if (seconds <= 0) return null;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Przypomnienie: ${title}`,
        body: 'Zostało 24 godziny do rozpoczęcia wydarzenia',
        sound: 'default',
        data: { eventId },
      },
      trigger: ({ seconds, repeats: false } as any),
    });
    await AsyncStorage.setItem(REMINDER_KEY_PREFIX + eventId, id);
    return id;
  } catch (e) {
    console.warn('scheduleEventReminder error', e);
    return null;
  }
}

export async function cancelEventReminder(eventId: string) {
  if (isExpoGo) {
    console.log(`[Reminder stub] Cancelled for ${eventId}`);
    return;
  }
  try {
    const key = REMINDER_KEY_PREFIX + eventId;
    const id = await AsyncStorage.getItem(key);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('cancelEventReminder error', e);
  }
}

export async function cancelAllRemindersForUser() {
  if (isExpoGo) {
    console.log('[Reminder stub] Cancelled all reminders');
    return;
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const reminderKeys = keys.filter(k => k.startsWith(REMINDER_KEY_PREFIX));
    const ids = await AsyncStorage.multiGet(reminderKeys);
    for (const [, id] of ids) {
      if (id) await Notifications.cancelScheduledNotificationAsync(id);
    }
    await AsyncStorage.multiRemove(reminderKeys);
  } catch (e) {
    console.warn('cancelAllRemindersForUser error', e);
  }
}
