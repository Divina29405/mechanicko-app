import { Ionicons } from "@expo/vector-icons";
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

import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  getSharedAvatarUrl,
  publishSharedAvatarUrl,
  subscribeToSharedAvatar,
} from "@/lib/avatarStore";
import { supabase } from "@/lib/supabase";

const appLogo = require("../assets/images/mechanichome.png");

export function MotoristHomeHeader() {
  const router = useRouter();
  const pathname = usePathname();
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
  const screenTitle = pathname.includes("motorist-profile")
    ? "Profile"
    : pathname.includes("messages")
      ? "Messages"
      : pathname.includes("motorist-activity")
        ? "Bookings"
        : pathname.includes("help-center")
          ? "Activity"
          : "Home";

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
        {
          paddingTop: Platform.OS === "ios" ? 58 : 44,
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
          <TouchableOpacity
            style={styles.activityButton}
            onPress={() => router.push("/notifications")}
            accessibilityLabel="Open notifications"
          >
            <Ionicons
              name="notifications-outline"
              size={27}
              color={colors.text}
            />
          </TouchableOpacity>
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
              size={50}
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
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 0,
    borderWidth: 1,
    zIndex: 10,
    elevation: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
  },
  headerRow: { minHeight: 58, flexDirection: "row", alignItems: "center" },
  appLogo: { width: 74, height: 58 },
  screenTitle: { flex: 1, marginLeft: 8, fontSize: 22, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  activityButton: {
    width: 34,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    borderWidth: 1,
  },
});
