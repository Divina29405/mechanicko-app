import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const gradientColors = [
  "#373327",
  "#686150",
  "#9E9786",
  "#DCDCDB",
  "#F3F3F5",
  "#F8F8FA",
] as const;

export default function QuickAccountSetupScreen() {
  const { role, completed } = useLocalSearchParams<{
    role?: string;
    completed?: string;
  }>();
  const isMechanic = role === "mechanic";
  const isCompleted = completed === "1";

  function continueSetup() {
    if (isCompleted) {
      router.push({
        pathname: "/add-primary-ride",
        params: { role: isMechanic ? "mechanic" : "customer" },
      });
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
      <Stack.Screen options={{ animation: "slide_from_right" }} />
    <LinearGradient
      colors={gradientColors}
      locations={[0, 0.2, 0.38, 0.56, 0.72, 1]}
      style={styles.screen}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(auth)/signup");
              }
            }}
            style={[styles.backButton, isCompleted && styles.completedBackButton]}
          >
            <Ionicons name="arrow-back" size={25} color="#FFFFFF" />
          </Pressable>

          {isCompleted ? (
            <View style={styles.onboardingTopBar}>
              <View style={styles.progress}>
                {Array.from({ length: 6 }, (_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.progressItem,
                      index < 2 && styles.progressItemActive,
                    ]}
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip onboarding"
                hitSlop={12}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            </View>
          ) : null}

          <View
            style={[
              styles.setupCard,
              isCompleted && styles.completedSetupCard,
            ]}
          >
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.title}>Quick Account Setup</Text>
                <Text style={styles.subtitle}>Setup your account</Text>
              </View>
              <Text style={styles.progressBadge}>
                {isCompleted ? "1/3 Finished" : "0/3 Finished"}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  isCompleted && styles.progressFillCompleted,
                ]}
              />
            </View>

            <SetupItem
              icon="person"
              title="1. Register your account"
              description="Provide necessary information"
              status={isCompleted ? "FINISHED" : "PENDING"}
              statusStyle={
                isCompleted ? styles.finishedStatus : styles.pendingStatus
              }
              iconStyle={styles.personIcon}
            />
            <SetupItem
              title="1. Add your primary ride"
              description="Motorcycle / Car / Van"
              status={isCompleted ? "PENDING" : "NOT STARTED"}
              statusStyle={
                isCompleted ? styles.pendingStatus : styles.notStartedStatus
              }
              image
            />
            <SetupItem
              icon="navigate-outline"
              title="2. Set dispatch location"
              description="Home zone & frequent routes"
              status="NOT STARTED"
              statusStyle={styles.notStartedStatus}
              iconStyle={styles.locationIcon}
            />
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
              <Text style={styles.proceedText}>Proceed</Text>
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
          <Ionicons name={icon ?? "person"} size={17} color="#1E3A8A" />
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
  },
  backButton: {
    position: "absolute",
    top: 24,
    left: 18,
    zIndex: 2,
  },
  completedBackButton: {
    top: 73,
  },
  setupCard: {
    width: "100%",
    minHeight: 324,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
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
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
  },
  subtitle: {
    color: "#2C2F35",
    fontSize: 10,
    lineHeight: 14,
  },
  progressBadge: {
    color: "#D97706",
    backgroundColor: "#E6E8FF",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "700",
  },
  progressTrack: {
    height: 5,
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
  setupItem: {
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F2FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
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
    width: 24,
    height: 24,
  },
  itemCopy: {
    flex: 1,
  },
  itemTitle: {
    color: "#2C2F35",
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  itemDescription: {
    color: "#2C2F35",
    fontSize: 9,
    lineHeight: 13,
  },
  status: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 9,
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
    borderRadius: 11,
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
    fontSize: 18,
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
