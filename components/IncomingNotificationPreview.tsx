import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useNotificationPreview } from "@/contexts/NotificationContext";
import { useAppTheme } from "@/contexts/ThemeContext";

const dispatchOrange = "#E87900";
const dispatchRed = "#EF2D2D";

export function IncomingNotificationPreview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const { notificationPreview, dismissNotificationPreview } =
    useNotificationPreview();

  const dismiss = () => {
    dismissNotificationPreview();
  };

  const openHome = () => {
    dismissNotificationPreview();
    router.replace("/(app)");
  };

  if (
    !session?.user.id ||
    notificationPreview?.type !== "emergency_request"
  ) {
    return null;
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          paddingTop: insets.top + 48,
          paddingHorizontal: 12,
          alignItems: "flex-end",
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[
          styles.banner,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderTopColor: dispatchOrange,
          },
        ]}
        onPress={openHome}
        accessibilityRole="button"
        accessibilityLabel="SOS Emergency Dispatch incoming. Tap to view home."
      >
        <View style={styles.bannerContent}>
          <View style={styles.alertIcon}>
            <Ionicons name="alert" size={27} color="#FFFFFF" />
          </View>
          <View style={styles.message}>
            <Text style={[styles.title, { color: colors.text }]}>
              SOS Emergency Dispatch
            </Text>
            <Text style={[styles.description, { color: colors.textMuted }]}>
              SOS Emergency Dispatch incoming.
            </Text>
            <Text style={styles.tapToView}>Tap to view</Text>
          </View>
          <Pressable
            style={styles.dismissButton}
            onPress={(event) => {
              event.stopPropagation();
              dismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss SOS dispatch alert"
            hitSlop={8}
          >
            <Ionicons name="close" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "86%",
    maxWidth: 360,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 5,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 12,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingRight: 20,
  },
  alertIcon: {
    width: 38,
    height: 38,
    marginTop: 2,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: dispatchRed,
  },
  message: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  tapToView: {
    color: dispatchRed,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  dismissButton: {
    position: "absolute",
    top: 11,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: dispatchOrange,
  },
});
