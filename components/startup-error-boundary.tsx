import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type StartupErrorBoundaryProps = {
  children: ReactNode;
};

type StartupErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Chặn lỗi render ở tầng ứng dụng. Không hiển thị stack trace hoặc dữ liệu
 * phiên cho người dùng; chi tiết kỹ thuật chỉ được ghi vào console native.
 */
export class StartupErrorBoundary extends Component<StartupErrorBoundaryProps, StartupErrorBoundaryState> {
  state: StartupErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): StartupErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[startup-boundary]", error.name, error.message, info.componentStack);
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>ChatPHT gặp lỗi khi mở</Text>
          <Text style={styles.description}>
            Phiên hiện tại chưa bị xóa. Hãy thử mở lại màn hình; nếu lỗi lặp lại, vui lòng gửi nhật ký lỗi Android để xử lý chính xác.
          </Text>
          <Pressable onPress={this.retry} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Thử mở lại</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F8FC", padding: 24 },
  card: { width: "100%", maxWidth: 420, borderRadius: 22, backgroundColor: "#FFFFFF", padding: 22, shadowColor: "#162D5A", shadowOpacity: 0.12, shadowRadius: 18, elevation: 4 },
  title: { color: "#172554", fontSize: 21, fontWeight: "800" },
  description: { color: "#52627A", fontSize: 15, lineHeight: 22, marginTop: 10 },
  button: { alignItems: "center", borderRadius: 12, backgroundColor: "#2563EB", marginTop: 20, minHeight: 48, justifyContent: "center" },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
