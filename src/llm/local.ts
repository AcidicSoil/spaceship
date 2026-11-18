import { streamChat, requestModel } from "./transport.ts"

export const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:1234/v1"
const SETTINGS_KEY = "spaceship-local-inference"
const NON_THINKING = { reasoning_effort: "none" }

export type LocalSettings = {
  endpoint: string
  writer: string
  decisionEndpoint: string
  decision: string
}

export function normalizeLocalEndpoint(value: string) {
  const url = new URL(value.trim())
  const pathname = url.pathname.replace(/\/+$/, "")
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (pathname && pathname !== "/v1")
  ) {
    throw new Error("Use a loopback endpoint such as http://127.0.0.1:1234/v1")
  }
  return `${url.origin}/v1`
}

export function createLocalSettings({ endpoint, writer, decisionEndpoint, decision }: LocalSettings): LocalSettings {
  const settings = {
    endpoint: normalizeLocalEndpoint(endpoint),
    writer: writer.trim(),
    decisionEndpoint: normalizeLocalEndpoint(decisionEndpoint),
    decision: decision.trim(),
  }
  if (!settings.writer || !settings.decision) throw new Error("Select both a writing and a decision model")
  return settings
}

export function saveLocalSettings(settings: LocalSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function storedLocalSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (!raw) return undefined
  const saved: unknown = JSON.parse(raw)
  if (typeof saved !== "object" || saved === null) throw new Error("Invalid saved local model settings")
  // Previous settings used chat completion for "decisions". Require reconfiguration.
  if (!("decisionEndpoint" in saved)) return undefined
  if (!("endpoint" in saved && "writer" in saved && "decision" in saved)) throw new Error("Invalid saved local model settings")
  if (
    typeof saved.endpoint !== "string" ||
    typeof saved.writer !== "string" ||
    typeof saved.decisionEndpoint !== "string" ||
    typeof saved.decision !== "string"
  )
    throw new Error("Invalid saved local model settings")
  return createLocalSettings({
    endpoint: saved.endpoint,
    writer: saved.writer,
    decisionEndpoint: saved.decisionEndpoint,
    decision: saved.decision,
  })
}

function requireSettings() {
  const settings = storedLocalSettings()
  if (!settings) throw new Error("Configure your local model endpoint in the launch dialog")
  return settings
}

export async function listLocalModels(endpoint: string) {
  const base = normalizeLocalEndpoint(endpoint)
  const response = await requestModel(base + "/models", { method: "GET" })
  if (!response.ok) throw new Error(`Model discovery HTTP ${response.status}`)
  const result: unknown = await response.json()
  if (typeof result !== "object" || result === null) throw new Error("Model endpoint returned invalid JSON")
  const entries = "data" in result ? result.data : "models" in result ? result.models : undefined
  if (!Array.isArray(entries)) throw new Error("Model endpoint did not return a models list")
  return entries.flatMap((entry) => {
    if (typeof entry === "string") return [entry]
    if (typeof entry !== "object" || entry === null) return []
    if ("id" in entry && typeof entry.id === "string") return [entry.id]
    if ("name" in entry && typeof entry.name === "string") return [entry.name]
    return []
  })
}

export async function* streamLocalText(request: { system: string; user: string; temperature: number; maxCompletionTokens: number; signal: AbortSignal }) {
  const settings = requireSettings()
  yield* streamChat(
    `${settings.endpoint}/chat/completions`,
    {
      ...NON_THINKING,
      model: settings.writer,
      temperature: request.temperature,
      max_tokens: request.maxCompletionTokens,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    },
    request.signal,
  )
}
