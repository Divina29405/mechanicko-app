import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useMechanic } from '@/contexts/MechanicContext';
import { colors, spacing } from '@/lib/theme';
import { useAppTheme } from '@/contexts/ThemeContext';

type Props = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
  profileHeader?: boolean;
  hideHeader?: boolean;
  safeAreaTop?: boolean;
};

function displayName(fullName: string | undefined, email: string | undefined) {
  if (fullName?.trim()) return fullName.trim();
  const local = email?.split('@')[0];
  return local ? local.replace(/[._]/g, ' ') : 'Mekaniko';
}

export function MechanicScreen({
  children,
  title,
  subtitle,
  right,
  back,
  profileHeader = false,
  hideHeader = false,
  safeAreaTop = true,
}: Props) {
  const theme = useAppTheme();
  const { session } = useAuth();
  const { online, rating, avatarUrl } = useMechanic();
  const name = displayName(
    typeof session?.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name
      : undefined,
    session?.user.email,
  );

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.white }]}
      edges={safeAreaTop ? ['top'] : []}
    >
      {profileHeader ? (
        <View style={[styles.profileHeader, { backgroundColor: colors.white }]}>
          <Pressable
            style={styles.profileIdentity}
            onPress={() => router.push('./profile')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <View style={styles.profileAvatarWrap}>
              <ProfileAvatar
                uri={avatarUrl}
                name={name}
                size={48}
                backgroundColor={colors.amberSoft}
              />
              <View
                style={[
                  styles.profileStatusDot,
                  { borderColor: theme.colors.card },
                  online && styles.profileStatusDotOnline,
                ]}
              />
            </View>
            <View style={styles.profileIdentityText}>
              <Text style={[styles.profileName, { color: theme.colors.text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.profileAvailability, { color: theme.colors.textMuted }]}>
                {online ? 'Available' : 'Not Available'}
              </Text>
            </View>
          </Pressable>
          <View style={styles.profileActions}>
            <View style={styles.profileRating}>
              <Ionicons name="star" size={20} color={colors.amber} />
              <Text style={[styles.profileRatingValue, { color: theme.colors.text }]}>
                {rating.toFixed(2)}
              </Text>
            </View>
            <Pressable
              style={styles.profileNotification}
              onPress={() => router.push('./notifications')}
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={colors.amber} />
            </Pressable>
          </View>
        </View>
      ) : null}
      {!hideHeader ? (
        <View style={[styles.header, { backgroundColor: colors.white, borderBottomColor: theme.colors.border }]}>
          {back ? (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('./');
                }
              }}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color="#000000" />
            </Pressable>
          ) : null}
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}

export function HeaderIconButton({
  onPress,
  children,
}: {
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  profileHeader: {
    minHeight: 70,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  profileAvatarWrap: {
    position: 'relative',
  },
  profileStatusDot: {
    position: 'absolute',
    right: 0,
    top: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.sos,
    borderWidth: 2,
  },
  profileStatusDotOnline: {
    backgroundColor: colors.success,
  },
  profileIdentityText: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
  },
  profileAvailability: {
    fontSize: 12,
    marginTop: 2,
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileRatingValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  profileNotification: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  headerText: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    display: 'none',
    color: colors.textMuted,
    fontSize: 13,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
