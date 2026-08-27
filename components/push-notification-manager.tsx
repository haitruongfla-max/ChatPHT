import { useAuth } from "@/hooks/use-auth";
import {
  conversationIdFromPushData,
  incomingCallActionFromUrl,
  registerForChatPushNotifications,
  storePushToken,
} from "@/lib/push-notifications";
import { trpc } from "@/lib/trpc";
import { useCalling } from "@/components/calling-manager";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

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

function openNotification(data: unknown) {
  const conversationId = conversationIdFromPushData(data);
  if (conversationId) router.push(`/chat/${conversationId}` as never);
}

export function PushNotificationManager() {
  const { user } = useAuth();
  const { handleExternalCallAction } = useCalling();
  const { mutateAsync: registerDevice } = trpc.notifications.registerDevice.useMutation();
  const registeredTokens = useRef(new Set<string>());

  // A device token belongs to the authenticated account. Clear the in-memory
  // guard when the account changes so a subsequent login registers the token
  // for the new account instead of silently reusing the previous registration.
  useEffect(() => {
    registeredTokens.current.clear();
  }, [user?.id]);

  const saveToken = useCallback(async (token: string, transport: "expo" | "fcm") => {
    const tokenKey = `${transport}:${token}`;
    if (registeredTokens.current.has(tokenKey)) return;
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await registerDevice({ token, platform, transport });
    registeredTokens.current.add(tokenKey);
    await storePushToken(token, transport);
  }, [registerDevice]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const initial = Notifications.getLastNotificationResponse();
    if (initial?.notification) openNotification(initial.notification.request.content.data);
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotification(response.notification.request.content.data);
    });
    return () => {
      responseListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    let active = true;
    const handleUrl = (url: string | null) => {
      if (!url || !active) return;
      const action = incomingCallActionFromUrl(url);
      if (action) void handleExternalCallAction(action).catch((error) => console.warn("[Call] Không thể xử lý thao tác cuộc gọi.", error));
    };
    void Linking.getInitialURL().then(handleUrl);
    const urlSubscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => { active = false; urlSubscription.remove(); };
  }, [handleExternalCallAction, user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    let active = true;
    const registerDeviceForPush = async () => {
      try {
        const tokens = await registerForChatPushNotifications();
        if (!tokens || !active) return;
        await saveToken(tokens.expoToken, "expo");
        if (tokens.fcmToken) await saveToken(tokens.fcmToken, "fcm");
      } catch (error) {
        console.warn("[Push] Không thể đăng ký thông báo trên thiết bị này.", error);
      }
    };
    void registerDeviceForPush();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void registerDeviceForPush();
    });
    return () => {
      active = false;
      appStateSubscription.remove();
    };
  }, [saveToken, user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    const subscription = Notifications.addPushTokenListener((token) => {
      void saveToken(token.data, "expo").catch((error) => console.warn("[Push] Không thể cập nhật token thông báo.", error));
    });
    return () => subscription.remove();
  }, [saveToken, user]);

  return null;
}
