export const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
};

const readSse = async (response, onEvent, options = {}) => {
  if (!response.body) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    onEvent({ type: "result", ...body });
    return body;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let streamError = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) {
        continue;
      }
      const event = JSON.parse(data);
      onEvent(event);
      if (event.type === "result") {
        result = event;
      }
      if (event.type === "error") {
        streamError = event.error || "Request failed";
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
  if (!result) {
    if (options.requireResult === false) {
      return { ok: true };
    }
    throw new Error("No result from server");
  }
  return result;
};

export const streamApi = async (path, body, onEvent, options = {}) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok && response.status !== 200) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return readSse(response, onEvent, options);
};
