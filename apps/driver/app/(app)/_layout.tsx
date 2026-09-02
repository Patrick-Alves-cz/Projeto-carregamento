import { Stack } from "expo-router";
import { colors } from "../../lib/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.bg },
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="station/[id]" options={{ title: "Estação" }} />
      <Stack.Screen name="charging/[sessionId]" options={{ title: "Recarga" }} />
    </Stack>
  );
}
