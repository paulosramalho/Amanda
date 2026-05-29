import Anthropic from "@anthropic-ai/sdk";

export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export function createAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

export function sanitizeUnicodeString(value) {
  let sanitized = "";

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        sanitized += value[i] + value[i + 1];
        i++;
      } else {
        sanitized += "\ufffd";
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      sanitized += "\ufffd";
      continue;
    }

    sanitized += value[i];
  }

  return sanitized;
}

export function sanitizeJsonValue(value) {
  if (typeof value === "string") return sanitizeUnicodeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizeJsonValue(item)])
  );
}

export function createAnthropicMessage(client, payload) {
  return client.messages.create(sanitizeJsonValue(payload));
}
