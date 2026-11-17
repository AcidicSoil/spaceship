/** Shared OpenAI-compatible transport for cloud and loopback servers. */
export async function postChat(url: string, body: Record<string, unknown>, signal: AbortSignal, apiKey?: string) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`)

  // Chrome's Local Network Access gate needs the target address space on HTTPS pages.
  const init = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
    ...(url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:") || url.startsWith("http://[::1]:")
      ? { targetAddressSpace: "loopback" as const }
      : {}),
  }
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`Model server HTTP ${response.status}: ${await response.text()}`)
  return response
}

export async function* streamChat(url: string, body: Record<string, unknown>, signal: AbortSignal, apiKey?: string) {
  const response = await postChat(url, { ...body, stream: true }, signal, apiKey)
  if (!response.body) throw new Error("No streaming response body")

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = (buffer + value).split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const data = line.trim().startsWith("data:") ? line.trim().slice(5).trim() : ""
        if (!data || data === "[DONE]") continue
        const content = JSON.parse(data).choices?.[0]?.delta?.content
        if (typeof content === "string") yield content
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function completeChat(url: string, body: Record<string, unknown>, signal: AbortSignal) {
  const response = await postChat(url, { ...body, stream: false }, signal)
  const content: unknown = (await response.json()).choices?.[0]?.message?.content
  if (typeof content !== "string") throw new Error("Model returned no text")
  return content
}
