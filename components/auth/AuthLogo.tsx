import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/lib/theme";

export function AuthLogo({
  variant = "amber",
}: {
  variant?: "amber" | "blue";
}) {
  const isBlue = variant === "blue";

  return (
    <View style={[styles.wrap, isBlue && styles.blueWrap]}>
      <View style={[styles.badge, isBlue && styles.blueBadge]}>
        <View style={[styles.badgeInner, isBlue && styles.blueBadgeInner]}>
          {isBlue ? (
            <Image
              source={require("../../assets/images/mechaniclogo.png")}
              resizeMode="contain"
              style={styles.mechanicLogo}
            />
          ) : (
            <Ionicons name="construct" size={28} color={colors.bg} />
          )}
        </View>
      </View>
      <Text style={styles.wordmark}>MECHANIC KO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  blueWrap: {
    transform: [{ translateY: -30 }],
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: colors.amberSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(240, 162, 2, 0.28)",
  },
  badgeInner: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.amber,
  },
  blueBadge: {
    width: 55,
    height: 55,
    borderRadius: 12,
    backgroundColor: "#24439A",
    borderColor: "#24439A",
  },
  blueBadgeInner: {
    width: 58,
    height: 58,
    borderRadius: 11,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  mechanicLogo: {
    width: 31,
    height: 31,
  },
  wordmark: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 28,
    letterSpacing: 3.2,
    fontFamily: "sans-serif",
    fontWeight: "900",
    marginTop: 15,
  },
});
