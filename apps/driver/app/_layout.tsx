import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { getStoredTokens } from "../lib/api-client";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const tokens = await getStoredTokens();
      const inApp = segments[0] === "(app)";
      if (!tokens && inApp) router.replace("/login");
      else if (tokens && segments[0] === "login") router.replace("/(app)/(tabs)");
      setReady(true);
    }
    void checkAuth();
  }, [segments, router]);

  if (!ready) {
    return <View style={{ backgroundColor: colors.bg, flex: 1 }} />;
  }

  return (
    <View style={{ backgroundColor: colors.bg, flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="(app)" />
      </Stack>
    </View>
  );
}
