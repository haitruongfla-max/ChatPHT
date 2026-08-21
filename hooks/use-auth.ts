import * as Auth from "@/lib/_core/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = { autoFetch?: boolean };

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(autoFetch);

  const refresh = useCallback(async () => {
    setLoading(true);
    setUser(await Auth.getUserInfo());
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await Auth.removeSessionToken();
    await Auth.clearUserInfo();
    setUser(null);
  }, []);

  useEffect(() => {
    if (autoFetch) void refresh();
    else setLoading(false);
  }, [autoFetch, refresh]);

  return { user, loading, isAuthenticated: Boolean(user), refresh, logout };
}
