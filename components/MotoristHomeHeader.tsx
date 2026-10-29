import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileAvatar } from "@/components/ProfileAvatar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  getSharedAvatarUrl,
  publishSharedAvatarUrl,
  subscribeToSharedAvatar,
} from "@/lib/avatarStore";
import { supabase } from "@/lib/supabase";
import { normalizeText } from "@/lib/typography";

const appLogo = require("../assets/images/mechanichome.png");

type MotoristHomeHeaderProps = {
  title?: string;
  floating?: boolean;
};

export function MotoristHomeHeader({
  title,
  floating = false,
}: MotoristHomeHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [titleAnimation] = useState(() => new Animated.Value(1));
  const { session } = useAuth();
  const { colors } = useAppTheme();
  
  const metadataAvatarUrl =
    typeof session?.user.user_metadata?.avatar_url === "string"
      ? session.user.user_metadata.avatar_url
      : null;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    () => getSharedAvatarUrl() || metadataAvatarUrl,
  );
  
  const name =
    typeof session?.user.user_metadata?.full_name === "string"
      ? session.user.user_metadata.full_name
      : session?.user.email?.split("@")[0] || "Motorist";
      
  const screenTitle =
    title ??
    (pathname.includes("motorist-profile")
      ? "Profile"
      : pathname.includes("messages")
        ? "Messages"
        : pathname.includes("motorist-activity")
          ? "Bookings"
          : pathname.includes("help-center")
            ? "Activity"
            : "Home");

  useEffect(() => {
    titleAnimation.setValue(0);
    Animated.timing(titleAnimation, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [pathname, titleAnimation]);

  useEffect(() => {
    const unsubscribe = subscribeToSharedAvatar(setAvatarUrl);
    if (!session?.user.id) {
      return unsubscribe;
    }
    let active = true;
    void supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!active || !data?.avatar_path) return;
        const { data: signed } = await supabase.storage
          .from("mechanic-avatars")
          .createSignedUrl(data.avatar_path, 60 * 60);
        if (active && signed?.signedUrl && !getSharedAvatarUrl()) {
          publishSharedAvatarUrl(signed.signedUrl);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [metadataAvatarUrl, session?.user.id]);
  
  return (
    <View
      style={[
        styles.topContainer,
        floating && styles.floatingTopContainer,
        {
          paddingTop:
            Platform.OS === "ios"
              ? Math.max(insets.top, 58)
              : Math.max(insets.top, 44),
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Image source={appLogo} resizeMode="contain" style={styles.appLogo} />
        <Animated.Text
          style={[
            styles.screenTitle,
            { color: colors.text },
            {
              opacity: titleAnimation,
              transform: [
                {
                  translateY: titleAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [4, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {screenTitle}
        </Animated.Text>
        <View style={styles.headerActions}>
          <NotificationBell
            color={colors.text}
            style={styles.activityButton}
          />
          <TouchableOpacity
            style={[
              styles.iconCircle,
              { backgroundColor: "#FFF1D6", borderColor: "#F0A202" },
            ]}
            onPress={() => router.push("/motorist-profile")}
            accessibilityLabel="Open motorist profile"
          >
            <ProfileAvatar
              uri={avatarUrl}
              name={name}
              size={32}
              backgroundColor="#FFF1D6"
              borderColor="#F0A202"
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topContainer: {
    position: "relative",
    left: 0,
    right: 0,
    paddingHorizontal: 16, 
    paddingBottom: 6, 
    borderWidth: 1,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    zIndex: 10,
    elevation: 3, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  floatingTopContainer: {
    position: "absolute",
    borderRadius: 0,
    zIndex: 10,
    elevation: 7,
    shadowOpacity: 0.14,
    shadowRadius: 7,
  },
  headerRow: { 
    minHeight: 36, 
    flexDirection: "row", 
    alignItems: "center" 
  },
  appLogo: { 
    width: 46, 
    height: 36, 
  },
  screenTitle: { 
    flex: 1, 
    marginLeft: 10, 
    fontSize: normalizeText(18), 
    fontWeight: "800" 
  },
  headerActions: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 12 
  },
  activityButton: {
    width: 32,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 32, 
    height: 32, 
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    borderWidth: 1,
  },
});