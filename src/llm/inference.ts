import { storedApiKey, streamCompletion, type CompletionRequest } from "./cerebras.ts"
import { createDecisions, storedGeminiKey, type DecisionRequest } from "./decisions.ts"
import { streamLocalText } from "./local.ts"
import { localDecisions } from "./systemone.ts"
import { currentMode } from "./mode.ts"

export async function* streamText(request: Omit<CompletionRequest, "apiKey">) {
  if (currentMode() === "local") {
    yield* streamLocalText(request)
    return
  }
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("Save a Cerebras API key first")
  yield* streamCompletion({ ...request, apiKey })
}

export function scoreDecisions(request: DecisionRequest, signal: AbortSignal) {
  if (currentMode() === "local") return localDecisions(request, signal)
  const apiKey = storedGeminiKey()
  if (!apiKey) throw new Error("Save a Gemini API key first")
  return createDecisions(apiKey, request, signal)
}
