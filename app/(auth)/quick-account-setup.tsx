import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { normalizeText } from "@/lib/typography";

const gradientColors = [
  "#F8FAFC",
  "#F1F5F9",
] as const;

export default function QuickAccountSetupScreen() {
  const { role, completed, back } = useLocalSearchParams<{
    role?: string;
    completed?: string;
    back?: string;
  }>();
  const isMechanic = role === "mechanic";
  const requestedCompletedStep =
    completed === "3" ? 3 : completed === "2" ? 2 : completed === "1" ? 1 : 0;
  const completedStep = isMechanic
    ? requestedCompletedStep
    : Math.min(requestedCompletedStep, 2);
  const totalSteps = isMechanic ? 3 : 2;
  const isAccountCompleted = completedStep >= 1;
  const isRideCompleted = completedStep >= 2;
  const isDispatchCompleted = completedStep >= 3;

  function continueSetup() {
    if (completedStep === 1) {
      router.push({
        pathname: "/add-primary-ride",
        params: { role: isMechanic ? "mechanic" : "customer" },
      });
      return;
    }

    if (completedStep === 3) {
      router.push({
        pathname: "/submit-application",
        params: { role: isMechanic ? "mechanic" : "customer" },
      });
      return;
    } else if (completedStep === 2) {
      router.push(
        isMechanic
          ? {
              pathname: "/dispatch-location",
              params: { role: "mechanic" },
            }
          : {
              pathname: "/submit-application",
              params: { role: "customer" },
            },
      );
      return;
    }

    router.push({
      pathname: "/(auth)/signup",
      params: {
        role: isMechanic ? "mechanic" : "customer",
        setup: "complete",
      },
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          animation: back === "1" ? "slide_from_left" : "slide_from_right",
        }}
      />
    <LinearGradient
      colors={gradientColors}
      locations={[0, 1]}
      style={styles.screen}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={() => {
              router.back();
            }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={28} color="#0F172A" />
          </Pressable>

          <View
            style={[
              styles.setupCard,
              isAccountCompleted && styles.completedSetupCard,
            ]}
          >
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.title}>Quick Account Setup</Text>
                <Text style={styles.subtitle}>Setup your account</Text>
              </View>
              <Text style={styles.progressBadge}>
                {completedStep}/{totalSteps} Finished
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  isAccountCompleted && styles.progressFillCompleted,
                  isRideCompleted && styles.progressFillRideCompleted,
                  isDispatchCompleted && styles.progressFillDispatchCompleted,
                  !isMechanic &&
                    isRideCompleted &&
                    styles.progressFillMotoristCompleted,
                ]}
              />
            </View>

            <SetupItem
              icon="person"
              title="1. Register your account"
              description="Provide necessary information"
              status={isAccountCompleted ? "FINISHED" : "PENDING"}
              statusStyle={
                isAccountCompleted ? styles.finishedStatus : styles.pendingStatus
              }
              iconStyle={styles.personIcon}
            />
            <SetupItem
              title="1. Add your primary ride"
              description="Motorcycle / Car / Van"
              status={isRideCompleted ? "FINISHED" : isAccountCompleted ? "PENDING" : "NOT STARTED"}
              statusStyle={
                isRideCompleted ? styles.finishedStatus : isAccountCompleted ? styles.pendingStatus : styles.notStartedStatus
              }
              image
            />
            {isMechanic ? (
              <SetupItem
                icon="navigate-outline"
                title="2. Set dispatch location"
                description="Home zone & frequent routes"
                status={
                  isDispatchCompleted
                    ? "FINISHED"
                    : isRideCompleted
                      ? "PENDING"
                      : "NOT STARTED"
                }
                statusStyle={
                  isDispatchCompleted
                    ? styles.finishedStatus
                    : isRideCompleted
                      ? styles.pendingStatus
                      : styles.notStartedStatus
                }
                iconStyle={styles.locationIcon}
              />
            ) : null}
          </View>

          <View style={styles.bottomContent}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Proceed with account setup"
              onPress={continueSetup}
              style={({ pressed }) => [
                styles.proceedButton,
                pressed && styles.proceedPressed,
              ]}
            >
              <Text style={styles.proceedText}>
                {completedStep === 2 && !isMechanic ? "Submit" : "Proceed"}
              </Text>
              <Text style={styles.proceedArrow}>→</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
    </>
  );
}

function SetupItem({
  icon,
  image = false,
  title,
  description,
  status,
  statusStyle,
  iconStyle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  image?: boolean;
  title: string;
  description: string;
  status: string;
  statusStyle: object;
  iconStyle?: object;
}) {
  return (
    <View style={styles.setupItem}>
      <View style={[styles.itemIcon, iconStyle]}>
        {image ? (
          <Image
            source={require("../../assets/images/motorcycle.png")}
            resizeMode="contain"
            style={styles.rideIcon}
          />
        ) : (
          <Ionicons name={icon ?? "person"} size={24} color="#1E3A8A" />
        )}
      </View>
      <View style={styles.itemCopy}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <Text style={[styles.status, statusStyle]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 48,
  },
  onboardingTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  progress: {
    width: 260,
    height: 8,
    flexDirection: "row",
    gap: 8,
  },
  progressItem: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
  },
  progressItemActive: {
    backgroundColor: "#24439A",
  },
  skip: {
    color: "#1E3A8A",
    fontSize: normalizeText(16),
    fontWeight: "600",
  },
  backButton: {
    position: "absolute",
    top: 24,
    left: 18,
    zIndex: 2,
  },
  setupCard: {
    width: "100%",
    minHeight: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DCE3EF",
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    padding: 24,
    marginTop: 76,
  },
  completedSetupCard: {
    marginTop: 76,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "#0F172A",
    fontSize: normalizeText(23),
    fontWeight: "800",
  },
  subtitle: {
    color: "#475569",
    fontSize: normalizeText(14),
    marginTop: 4,
  },
  progressBadge: {
    color: "#D97706",
    backgroundColor: "#E6E8FF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: normalizeText(12),
    fontWeight: "800",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E7E9FA",
    marginTop: 20,
    marginBottom: 20,
  },
  progressFill: {
    width: "12%",
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#1748B5",
  },
  progressFillCompleted: {
    width: "33%",
  },
  progressFillRideCompleted: {
    width: "66%",
  },
  progressFillMotoristCompleted: {
    width: "100%",
  },
  progressFillDispatchCompleted: {
    width: "100%",
  },
  setupItem: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F2FF",
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  itemIcon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#DCE3FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  personIcon: {
    backgroundColor: "#DCE3FF",
  },
  locationIcon: {
    backgroundColor: "#F8E8E8",
  },
  rideIcon: {
    width: 28,
    height: 28,
    tintColor: "#1E3A8A", // Forces the white PNG to render as blue!
  },
  itemCopy: {
    flex: 1,
  },
  itemTitle: {
    color: "#0F172A",
    fontSize: normalizeText(15),
    fontWeight: "700",
  },
  itemDescription: {
    color: "#334155",
    fontSize: normalizeText(13),
    marginTop: 2,
  },
  status: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: normalizeText(11),
    fontWeight: "800",
  },
  pendingStatus: {
    color: "#D97706",
    backgroundColor: "#F5DEC8",
  },
  finishedStatus: {
    color: "#16803C",
    backgroundColor: "#BDEBCB",
  },
  notStartedStatus: {
    color: "#3C3F47",
    backgroundColor: "#D1D3DD",
  },
  bottomContent: {
    marginTop: "auto",
  },
  proceedButton: {
    alignSelf: "stretch",
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#132D73",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  proceedPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  proceedText: {
    color: "#FFFFFF",
    fontSize: normalizeText(18),
    fontWeight: "700",
  },
  proceedArrow: {
    color: "#FFFFFF",
    fontSize: normalizeText(24),
    marginLeft: 10,
    marginTop: -2,
  },
});