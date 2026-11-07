import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

type FeedbackPreferences = {
  vibration: boolean;
  audioFeedback: boolean;
};

export async function provideAccessibilityFeedback(
  message: string,
  preferences: FeedbackPreferences,
  type: 'success' | 'warning' | 'error' = 'success',
) {
  if (preferences.vibration && Platform.OS !== 'web') {
    try {
      const style =
        type === 'error'
          ? Haptics.NotificationFeedbackType.Error
          : type === 'warning'
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success;
      await Haptics.notificationAsync(style);
    } catch (error) {
      console.warn('O feedback tátil não está disponível:', error);
    }
  }

  if (preferences.audioFeedback) {
    try {
      Speech.speak(message, { language: 'pt-BR', rate: 0.9 });
    } catch (error) {
      console.warn('O feedback por áudio não está disponível:', error);
    }
  }
}
