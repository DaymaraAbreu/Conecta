import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let configured = false;

export async function configureNotifications() {
  if (Platform.OS === 'web') return false;
  if (!configured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    configured = true;
  }
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notifyIncomingMessage({
  senderName,
  message,
  showPreview,
}: {
  senderName: string;
  message: string;
  showPreview: boolean;
}) {
  if (Platform.OS === 'web') return false;
  const allowed = await configureNotifications();
  if (!allowed) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Nova mensagem de ${senderName}`,
      body: showPreview ? message : 'Você recebeu uma nova mensagem.',
      sound: undefined,
    },
    trigger: null,
  });
  return true;
}
