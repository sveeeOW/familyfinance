import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from './endpoints';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Запрашивает разрешение, получает Expo push-токен и регистрирует его на backend.
 * Безопасно завершается, если разрешение не выдано или нет EAS projectId (dev-сборка).
 */
export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await api.registerDevice(tokenData.data, Platform.OS);
  } catch {
    // нет projectId / разрешения / web — push не критичен, тихо пропускаем
  }
}
