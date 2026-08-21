import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PushNotificationManager } from "@/components/push-notification-manager";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const { user } = useAuth();
  const userId = user?.id;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mutateAsync: markAllDelivered } = trpc.conversations.markAllDelivered.useMutation();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  useEffect(() => {
    if (!userId) return;
    const updateDelivered = () => {
      void markAllDelivered().catch(() => undefined);
    };
    updateDelivered();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") updateDelivered();
    });
    return () => subscription.remove();
  }, [markAllDelivered, userId]);

  return (
    <>
      <PushNotificationManager />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: {
            paddingTop: 8,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Hộp thư",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="bubble.left.and.bubble.right.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="assistant"
          options={{
            title: "Trợ lý AI",
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="sparkles" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Tôi",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="person.fill" color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
