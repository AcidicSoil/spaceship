import { streamChat } from "./transport.ts"

const API_URL = "https://api.cerebras.ai/v1/chat/completions"
const MODEL = "gpt-oss-120b"

export const KEY_STORAGE = "cerebras-api-key"
export const storedApiKey = () => localStorage.getItem(KEY_STORAGE)?.trim()

export type CompletionRequest = {
  apiKey: string
  system: string
  user: string
  temperature: number
  maxCompletionTokens: number
  signal: AbortSignal
}

export function streamCompletion({ apiKey, system, user, temperature, maxCompletionTokens, signal }: CompletionRequest) {
  return streamChat(
    API_URL,
    {
      model: MODEL,
      reasoning_effort: "low",
      temperature,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    signal,
    apiKey,
  )
}
