import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export function SettingRow({
  title,
  subtitle,
  icon,
  value,
  onToggle,
  onPress,
  destructive = false,
  last = false,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  value?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const colors = useAppColors();
  const { preferences } = useApp();
  const content = (
    <>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: destructive ? colors.accent : colors.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Feather name={icon} size={17} color={destructive ? colors.destructive : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, paddingVertical: 14 * preferences.spacingScale }}>
        <AppText size={15} weight="600" color={destructive ? colors.destructive : colors.foreground}>{title}</AppText>
        {subtitle ? <AppText size={12} muted style={{ marginTop: 4 * preferences.spacingScale, lineHeight: 17 }}>{subtitle}</AppText> : null}
      </View>
      {typeof value === 'boolean' && onToggle ? (
        <Switch
          accessible={false}
          accessibilityLabel={title}
          accessibilityState={{ checked: value }}
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.card}
          testID={`switch-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        />
      ) : onPress ? (
        <Feather name="chevron-right" size={19} color={colors.mutedForeground} />
      ) : null}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: colors.border,
    minHeight: Math.max(
      62 * preferences.spacingScale * preferences.fontScale,
      preferences.largeTouchTargets ? 72 * preferences.spacingScale : 0,
    ),
  };
  if (onPress || onToggle) {
    return (
      <Pressable
        accessibilityRole={onToggle ? 'switch' : 'button'}
        accessibilityLabel={title}
        accessibilityState={onToggle ? { checked: value } : undefined}
        onPress={onPress ?? (() => onToggle?.(!value))}
        style={({ pressed }) => [style, { opacity: pressed ? 0.72 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={style}>{content}</View>;
}
