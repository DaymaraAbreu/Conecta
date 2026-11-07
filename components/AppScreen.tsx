import React, { ReactNode } from 'react';
import { Platform, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  tabPage?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function AppScreen({ children, scroll = true, tabPage = false, contentStyle }: AppScreenProps) {
  const colors = useAppColors();
  const { preferences } = useApp();
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : insets.bottom;
  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: webTop }}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            {
              width: '100%',
              maxWidth: Platform.OS === 'web' ? 840 : undefined,
              alignSelf: 'center',
              paddingHorizontal: 20 * preferences.spacingScale,
              paddingTop: 12 * preferences.spacingScale,
              paddingBottom: (tabPage ? 96 : 24) + webBottom * preferences.spacingScale,
            },
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            {
              flex: 1,
              width: '100%',
              maxWidth: Platform.OS === 'web' ? 840 : undefined,
              alignSelf: 'center',
              paddingBottom: Platform.OS === 'web' ? 34 : 0,
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}
