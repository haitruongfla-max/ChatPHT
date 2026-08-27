import * as Auth from "@/lib/_core/auth";
import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AuthContextValue = {
  user: Auth.User | null;
  loading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Nguồn trạng thái xác thực duy nhất của ứng dụng.
 * Chỉ provider này đọc SecureStore khi khởi động; các màn hình và manager dùng
 * cùng snapshot để tránh tự đọc lại phiên theo từng route rồi tạo flash/redirect.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const nextUser = await Auth.getUserInfo();
    setUser(nextUser);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await Auth.removeSessionToken();
    await Auth.clearUserInfo();
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: Boolean(user), refresh, logout }),
    [loading, logout, refresh, user],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth phải được dùng bên trong AuthProvider.");
  return context;
}
