import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { isAdminPanelRole, isDriverRole } from "@evcharge/shared";
import { getMe, getStoredTokens, isCookieBff, listVehicles, logout } from "../lib/api-client";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const first = String(segments[0] ?? "");
      const inApp = first === "(app)";
      const inOnboarding = first === "onboarding";
      const publicAuth =
        first === "login" ||
        first === "register" ||
        first === "forgot-password" ||
        first === "reset-password";

      if (isCookieBff()) {
        if (first === "login" || first === "forgot-password" || first === "reset-password") {
          if (typeof window !== "undefined") window.location.replace("/login");
          return;
        }
        try {
          const me = await getMe();
          if (isAdminPanelRole(me.role)) {
            if (typeof window !== "undefined") window.location.replace("/admin");
            return;
          }
          if (!isDriverRole(me.role)) {
            if (typeof window !== "undefined") window.location.replace("/acesso-negado");
            return;
          }
          const vehicles = await listVehicles().catch(() => []);
          const needsOnboarding = vehicles.length === 0;
          if (needsOnboarding && !inOnboarding) {
            router.replace("/onboarding");
            setReady(true);
            return;
          }
          if (!needsOnboarding && (publicAuth || inOnboarding)) {
            router.replace("/(app)/(tabs)");
          }
        } catch {
          if (first !== "register") {
            if (typeof window !== "undefined") window.location.replace("/login");
            return;
          }
        }
        setReady(true);
        return;
      }

      const tokens = await getStoredTokens();
      if (!tokens && (inApp || inOnboarding)) {
        router.replace("/login");
        setReady(true);
        return;
      }
      if (tokens) {
        try {
          const me = await getMe();
          if (!isDriverRole(me.role)) {
            await logout();
            router.replace("/login");
            setReady(true);
            return;
          }
          const vehicles = await listVehicles().catch(() => []);
          const needsOnboarding = vehicles.length === 0;
          if (needsOnboarding && !inOnboarding) {
            router.replace("/onboarding");
            setReady(true);
            return;
          }
          if (!needsOnboarding && (publicAuth || inOnboarding)) {
            router.replace("/(app)/(tabs)");
          }
        } catch {
          await logout();
          if (inApp || inOnboarding) router.replace("/login");
        }
      }
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
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(app)" />
      </Stack>
    </View>
  );
}
