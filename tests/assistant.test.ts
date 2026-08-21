import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/_core/llm", () => ({ invokeLLM: vi.fn() }));

import { invokeLLM } from "../server/_core/llm";
import { appRouter } from "../server/routers";

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId },
    req: {},
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

describe("assistant.ask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả lời câu hỏi đã xác thực mà không nhận dữ liệu hội thoại riêng tư", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Đây là câu trả lời ngắn gọn." } }],
    } as any);

    await expect(callerFor().assistant.ask({
      message: "Gợi ý lời chúc sinh nhật",
      context: [{ role: "user", content: "Ưu tiên ngắn gọn" }],
    })).resolves.toEqual({ answer: "Đây là câu trả lời ngắn gọn." });

    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5-mini",
      maxTokens: 600,
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user", content: "Ưu tiên ngắn gọn" }),
        expect.objectContaining({ role: "user", content: "Gợi ý lời chúc sinh nhật" }),
      ]),
    }));
  });

  it("từ chối ngữ cảnh vượt giới hạn trước khi gọi mô hình", async () => {
    const context = Array.from({ length: 7 }, () => ({ role: "user" as const, content: "Một câu hỏi" }));

    await expect(callerFor().assistant.ask({ message: "Xin chào", context })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("không làm lộ lỗi nội bộ của mô hình về ứng dụng", async () => {
    vi.mocked(invokeLLM).mockRejectedValue(new Error("upstream unavailable"));

    await expect(callerFor().assistant.ask({ message: "Xin chào", context: [] })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Trợ lý AI đang bận. Vui lòng thử lại sau ít phút.",
    });
  });
});
