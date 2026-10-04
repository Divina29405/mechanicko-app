import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { getUserRole, useAuth } from "@/contexts/AuthContext";
import { colors } from "@/lib/theme";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  if (session) {
    return getUserRole(session.user) === "mechanic" ? (
      <Redirect href="/(app)" />
    ) : (
      <Redirect href="/(auth)/login" />
    );
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
