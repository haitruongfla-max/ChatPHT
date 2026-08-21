export type AssistantSource = {
  label: string;
  url: string;
};

export type FormattedAssistantAnswer = {
  body: string;
  sources: AssistantSource[];
};

const MARKDOWN_LINK = /\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)]+)\)/gi;
const BARE_URL = /https?:\/\/[^\s<>()]+/gi;

function cleanUrl(value: string) {
  return value.trim().replace(/[),.;:!?]+$/g, "");
}

function fallbackLabel(url: string) {
  return url.replace(/^https?:\/\//i, "").split("/")[0]?.replace(/^www\./i, "") || "Nguồn tham khảo";
}

function shortLabel(label: string, url: string) {
  const trimmed = label.trim();
  if (!trimmed || trimmed.length > 46) return fallbackLabel(url);
  return trimmed;
}

/**
 * Removes long URLs from the prose while retaining each source as a compact,
 * safe-to-render external link. Both Markdown links and pasted raw URLs are supported.
 */
export function formatAssistantAnswer(content: string): FormattedAssistantAnswer {
  const sources: AssistantSource[] = [];

  const addSource = (label: string, rawUrl: string) => {
    const url = cleanUrl(rawUrl);
    if (!url || sources.some((source) => source.url === url)) return;
    sources.push({ label: shortLabel(label, url), url });
  };

  const withoutMarkdownLinks = content.replace(MARKDOWN_LINK, (_match, label: string, url: string) => {
    addSource(label, url);
    return " ";
  });

  const body = withoutMarkdownLinks
    .replace(BARE_URL, (url: string) => {
      const cleanedUrl = cleanUrl(url);
      addSource(fallbackLabel(cleanedUrl), cleanedUrl);
      return url.slice(cleanedUrl.length);
    })
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  return { body, sources };
}
