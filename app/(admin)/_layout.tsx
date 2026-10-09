import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function AdminLayout() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function verifyAdmin() {
      if (!session?.user.id) {
        if (active) setAuthorized(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      if (active) setAuthorized(data?.role === "admin");
    }
    void verifyAdmin();
    return () => {
      active = false;
    };
  }, [session]);

  if (loading || authorized === null) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (!session || !authorized) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
