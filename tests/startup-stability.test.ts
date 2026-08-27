import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("khởi động và đăng nhập ổn định", () => {
  it("dùng một provider xác thực duy nhất thay vì mỗi màn hình tự đọc SecureStore", () => {
    const auth = source("hooks/use-auth.ts");
    const layout = source("app/_layout.tsx");
    const login = source("app/login.tsx");

    expect(auth).toContain("const AuthContext = createContext");
    expect(auth).toContain("export function AuthProvider");
    expect(layout).toContain("<AuthProvider>");
    expect(login).not.toContain("Auth.getUserInfo().then");
    expect(login).toContain("const submitLocked = useRef(false);");
    expect(login).toContain("if (submitting || submitLocked.current) return;");
  });

  it("không để lỗi SecureStore của khóa ứng dụng làm hỏng quá trình mở app", () => {
    const appLock = source("lib/app-lock.ts");

    expect(appLock).toContain("async function readPin()");
    expect(appLock).toContain("return null;");
    expect(appLock).toContain("Không để dữ liệu khóa hỏng hoặc SecureStore lỗi làm sập ứng dụng lúc mở.");
  });

  it("có boundary khởi động và chỉ đọc body phản hồi lỗi một lần", () => {
    const boundary = source("components/startup-error-boundary.tsx");
    const layout = source("app/_layout.tsx");
    const client = source("lib/trpc.ts");

    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("Thử mở lại");
    expect(layout).toContain("<StartupErrorBoundary>");
    expect(client).not.toContain("response.clone().text()");
    expect(client).toContain("response.status === 429");
  });

  it("không khởi tạo controller WebRTC trước khi tài khoản được khôi phục", () => {
    const calling = source("components/calling-manager.tsx");

    expect(calling).toContain("if (!user)");
    expect(calling).toContain("signedOutCallingValue");
    expect(calling).toContain("AuthenticatedCallingProvider");
    expect(calling).toContain("const controller = useWebRTC({ userId });");
    expect(calling).not.toContain("useWebRTC({ userId: user?.id })");
  });
});
