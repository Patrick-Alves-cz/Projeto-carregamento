import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { getStoredTokens } from "../lib/api-client";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const tokens = await getStoredTokens();
      const inAuthGroup = segments[0] === "(app)";

      if (!tokens && inAuthGroup) {
        router.replace("/login");
      } else if (tokens && segments[0] === "login") {
        router.replace("/(app)");
      }
      setReady(true);
    }
    checkAuth();
  }, [segments, router]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
