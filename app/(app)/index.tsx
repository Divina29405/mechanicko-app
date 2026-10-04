import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SosCard } from "@/components/mechanic/SosCard";
import { useAuth } from "@/contexts/AuthContext";
import { useMechanic } from "@/contexts/MechanicContext";
import { formatPeso } from "@/lib/mechanic-mock";
import { colors, radii, spacing } from "@/lib/theme";

function displayName(fullName: string | undefined, email: string | undefined) {
  if (fullName?.trim()) return fullName.trim();
  const local = email?.split("@")[0];
  if (!local) return "Mekaniko";
  return local.replace(/[._]/g, " ");
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function MechanicHomeScreen() {
  const { session } = useAuth();
  const {
    online,
    setOnline,
    rating,
    todayEarnings,
    weeklyEarnings,
    completedToday,
    unreadNotifications,
  } = useMechanic();

  const name = displayName(
    typeof session?.user.user_metadata?.full_name === "string"
      ? session.user.user_metadata.full_name
      : undefined,
    session?.user.email,
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.hello}>Mekaniko</Text>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color={colors.amber} />
                <Text style={styles.rating}>{rating.toFixed(1)}</Text>
                <Text style={styles.ratingHint}>rating</Text>
              </View>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("./notifications")}
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={colors.text}
            />
            {unreadNotifications > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadNotifications}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.availability}>
          <View style={styles.flex}>
            <Text style={styles.availLabel}>
              {online ? "Online · tumatanggap ng trabaho" : "Offline"}
            </Text>
            <Text style={styles.availHint}>
              {online
                ? "Lilitaw ka sa radar ng malalapit na motorista."
                : "Hindi ka lilitaw sa SOS radar hangga’t naka-off."}
            </Text>
          </View>
          <Switch
            value={online}
            onValueChange={setOnline}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={colors.white}
            ios_backgroundColor={colors.border}
          />
        </View>

        <Text style={styles.section}>Emergency & urgent jobs</Text>
        <SosCard />

        {online ? (
          <>
            <Text style={styles.section}>Earnings ngayong araw</Text>
            <View style={styles.metrics}>
              <View style={[styles.metric, styles.metricWide]}>
                <Text style={styles.metricLabel}>Today</Text>
                <Text style={styles.metricValue}>
                  {formatPeso(todayEarnings)}
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>This week</Text>
                <Text style={styles.metricValueSm}>
                  {formatPeso(weeklyEarnings)}
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Jobs done</Text>
                <Text style={styles.metricValueSm}>{completedToday}</Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.amberSoft,
    borderWidth: 2,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.amber,
    fontWeight: "800",
    fontSize: 18,
  },
  identityText: {
    flex: 1,
  },
  hello: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  rating: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 13,
  },
  ratingHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.sos,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "800",
  },
  availability: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
  },
  availLabel: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  availHint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: {
    color: colors.amber,
    fontWeight: "700",
    marginTop: spacing.lg,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metric: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  metricWide: {
    flexBasis: "100%",
    backgroundColor: colors.amberSoft,
    borderColor: "rgba(240, 162, 2, 0.35)",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  metricValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  metricValueSm: {
    marginTop: 4,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.8,
  },
});
