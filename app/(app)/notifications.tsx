import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { colors, spacing } from "@/lib/theme";

export default function NotificationsScreen() {
  return (
    <MechanicScreen back title="Notifications">
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="notifications-off-outline" size={34} color={colors.amber} />
        </View>
        <Text style={styles.title}>This feature is not available yet.</Text>
        <Text style={styles.message}>Coming soon. Check soon for updates.</Text>
      </View>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.amberSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
