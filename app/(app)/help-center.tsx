import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { useAppTheme } from "@/contexts/ThemeContext";
import { colors, spacing } from "@/lib/theme";

export default function HelpCenterScreen() {
  const { colors: themeColors } = useAppTheme();

  return (
    <MechanicScreen back title="Help Center">
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="help-circle-outline" size={36} color={colors.blue} />
        </View>
        <Text style={[styles.title, { color: themeColors.text }]}>How can we help?</Text>
        <Text style={[styles.message, { color: themeColors.textMuted }]}>
          Find answers and support for your service requests.
        </Text>
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
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
