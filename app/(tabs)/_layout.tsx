import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

export default function TabLayout() {
  const { user } = useAuth();
  const userId = user?.id;
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
    <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#1769D4",
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: {
            paddingTop: 8,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
            backgroundColor: "#FBFDFF",
            borderTopColor: "#D9E8F6",
            borderTopWidth: 0.5,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Tin nhắn",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="bubble.left.and.bubble.right.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: "Danh bạ",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="person.2.fill" color={color} />,
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
  );
}
