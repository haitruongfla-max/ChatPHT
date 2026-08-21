import { describe, expect, it } from "vitest";

import { formatAssistantAnswer } from "../lib/assistant-links";

describe("formatAssistantAnswer", () => {
  it("ẩn URL Markdown dài khỏi nội dung và giữ nguồn ngắn có thể mở", () => {
    const result = formatAssistantAnswer(
      "Trẻ nên uống lượng sữa phù hợp. ([Hướng dẫn AAP](https://publications.aap.org/pediatrics/article/152/5/e2023064050/194469/Older-Infant-Young-Child-Formulas?utm_source=openai))",
    );

    expect(result.body).toBe("Trẻ nên uống lượng sữa phù hợp.");
    expect(result.sources).toEqual([
      {
        label: "Hướng dẫn AAP",
        url: "https://publications.aap.org/pediatrics/article/152/5/e2023064050/194469/Older-Infant-Young-Child-Formulas?utm_source=openai",
      },
    ]);
  });

  it("rút gọn URL thô thành tên miền nguồn", () => {
    const result = formatAssistantAnswer("Xem thêm tại https://www.example.org/a/very/long/path?from=assistant.");

    expect(result.body).toBe("Xem thêm tại.");
    expect(result.sources).toEqual([{ label: "example.org", url: "https://www.example.org/a/very/long/path?from=assistant" }]);
  });

  it("giữ nguyên câu trả lời không có nguồn", () => {
    expect(formatAssistantAnswer("Nội dung ngắn gọn.")).toEqual({ body: "Nội dung ngắn gọn.", sources: [] });
  });
});
