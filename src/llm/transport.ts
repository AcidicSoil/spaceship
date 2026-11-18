/** Shared network transport for local System One decisions and streamed text models. */
export function requestModel(url: string, init: RequestInit) {
  const isLoopback = url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:") || url.startsWith("http://[::1]:")
  return fetch(url, { ...init, ...(isLoopback ? { targetAddressSpace: "loopback" as const } : {}) })
}

/** Shared OpenAI-compatible transport for cloud and loopback servers. */
export async function postModelRequest(url: string, body: Record<string, unknown>, signal: AbortSignal, apiKey?: string) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`)

  // Chrome's Local Network Access gate needs the target address space on HTTPS pages.
  const response = await requestModel(url, { method: "POST", headers, body: JSON.stringify(body), signal })
  if (!response.ok) throw new Error(`Model server HTTP ${response.status}: ${await response.text()}`)
  return response
}

export async function* streamChat(url: string, body: Record<string, unknown>, signal: AbortSignal, apiKey?: string) {
  const response = await postModelRequest(url, { ...body, stream: true }, signal, apiKey)
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
