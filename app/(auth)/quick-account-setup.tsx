import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const gradientColors = [
  "#F5F7FA",
  "#F5F7FA",
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
            <Ionicons name="arrow-back" size={25} color="#000000" />
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
          <Ionicons name={icon ?? "person"} size={22} color="#1E3A8A" />
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
    paddingHorizontal: 18,
    paddingTop: 25,
    paddingBottom: 76,
  },
  onboardingTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 18,
  },
  progress: {
    width: 260,
    height: 10,
    flexDirection: "row",
    gap: 10,
  },
  progressItem: {
    flex: 1,
    height: 10,
    borderRadius: 4,
    backgroundColor: "#E8E8E8",
  },
  progressItemActive: {
    backgroundColor: "#24439A",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  skip: {
    color: "#24439A",
    fontSize: 16,
    fontWeight: "400",
  },
  backButton: {
    position: "absolute",
    top: 24,
    left: 18,
    zIndex: 2,
  },
  setupCard: {
    width: "100%",
    minHeight: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE3EF",
    shadowColor: "#17213D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    padding: 20,
    marginTop: 70,
  },
  completedSetupCard: {
    marginTop: 70,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "#18213D",
    fontSize: 21,
    fontWeight: "700",
    lineHeight: 26,
  },
  subtitle: {
    color: "#2C2F35",
    fontSize: 12,
    lineHeight: 17,
  },
  progressBadge: {
    color: "#D97706",
    backgroundColor: "#E6E8FF",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "700",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E7E9FA",
    marginTop: 16,
    marginBottom: 16,
  },
  progressFill: {
    width: "12%",
    height: "100%",
    borderRadius: 3,
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
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F2FF",
    borderRadius: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#DCE3FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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
  },
  itemCopy: {
    flex: 1,
  },
  itemTitle: {
    color: "#2C2F35",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  itemDescription: {
    color: "#2C2F35",
    fontSize: 11,
    lineHeight: 15,
  },
  status: {
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "700",
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
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: "#24439A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#132D73",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  proceedPressed: {
    opacity: 0.82,
  },
  proceedText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 20,
  },
  proceedArrow: {
    color: "#FFFFFF",
    fontSize: 21,
    lineHeight: 21,
    marginLeft: 8,
    marginTop: -2,
  },
});
