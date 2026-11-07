import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppColors } from '@/hooks/useAppColors';

export default function TabLayout() {
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: web ? 84 : 58 + insets.bottom,
          paddingTop: 7,
          paddingBottom: web ? 34 : Math.max(insets.bottom, 7),
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Conversas', tabBarIcon: ({ focused }) => <Feather name="message-circle" size={20} color={focused ? colors.primary : colors.mutedForeground} /> }} />
      <Tabs.Screen name="updates" options={{ title: 'Atualizações', tabBarIcon: ({ focused }) => <Feather name="circle" size={20} color={focused ? colors.primary : colors.mutedForeground} /> }} />
      <Tabs.Screen name="calls" options={{ title: 'Chamadas', tabBarIcon: ({ focused }) => <Feather name="phone" size={20} color={focused ? colors.primary : colors.mutedForeground} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Configurações', tabBarIcon: ({ focused }) => <Feather name="settings" size={20} color={focused ? colors.primary : colors.mutedForeground} /> }} />
    </Tabs>
  );
}
