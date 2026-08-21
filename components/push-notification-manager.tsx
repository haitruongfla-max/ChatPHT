import { useAuth } from "@/hooks/use-auth";
import {
  conversationIdFromPushData,
  registerForChatPushNotifications,
  storePushToken,
} from "@/lib/push-notifications";
import { trpc } from "@/lib/trpc";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function openConversation(data: unknown) {
  const conversationId = conversationIdFromPushData(data);
  if (conversationId) router.push(`/chat/${conversationId}` as never);
}

export function PushNotificationManager() {
  const { user } = useAuth();
  const { mutateAsync: registerDevice } = trpc.notifications.registerDevice.useMutation();
  const registeredToken = useRef<string | null>(null);

  const saveToken = async (token: string) => {
    if (registeredToken.current === token) return;
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await registerDevice({ token, platform });
    registeredToken.current = token;
    await storePushToken(token);
  };

  useEffect(() => {
    if (Platform.OS === "web") return;
    const initial = Notifications.getLastNotificationResponse();
    if (initial?.notification) openConversation(initial.notification.request.content.data);
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      openConversation(response.notification.request.content.data);
    });
    return () => responseListener.remove();
  }, []);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    let active = true;
    void (async () => {
      try {
        const token = await registerForChatPushNotifications();
        if (!token || !active) return;
        await saveToken(token);
        if (!active) return;
      } catch (error) {
        console.warn("[Push] Không thể đăng ký thông báo trên thiết bị này.", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [registerDevice, user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    const subscription = Notifications.addPushTokenListener((token) => {
      void saveToken(token.data).catch((error) => console.warn("[Push] Không thể cập nhật token thông báo.", error));
    });
    return () => subscription.remove();
  }, [registerDevice, user]);

  return null;
}
