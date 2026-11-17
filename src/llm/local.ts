import type { Answer, DecisionRequest } from "./decisions.ts"
import { completeChat, streamChat } from "./openai.ts"

export const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:1234/v1"
const SETTINGS_KEY = "spaceship-local-inference"
const NON_THINKING = { reasoning_effort: "none" }

export type LocalSettings = {
  endpoint: string
  writer: string
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

export function createLocalSettings(endpoint: string, writer: string, decision: string): LocalSettings {
  const settings = { endpoint: normalizeLocalEndpoint(endpoint), writer: writer.trim(), decision: decision.trim() }
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
  if (!("endpoint" in saved && "writer" in saved && "decision" in saved)) throw new Error("Invalid saved local model settings")
  if (typeof saved.endpoint !== "string" || typeof saved.writer !== "string" || typeof saved.decision !== "string")
    throw new Error("Invalid saved local model settings")
  return createLocalSettings(saved.endpoint, saved.writer, saved.decision)
}

function requireSettings() {
  const settings = storedLocalSettings()
  if (!settings) throw new Error("Configure your local model endpoint in the launch dialog")
  return settings
}

export async function listLocalModels(endpoint: string) {
  const base = normalizeLocalEndpoint(endpoint)
  // Keep the newer browser field while TypeScript's RequestInit types catch up.
  const requestInit = { method: "GET", targetAddressSpace: "loopback" as const }
  const response = await fetch(`${base}/models`, requestInit)
  if (!response.ok) throw new Error(`Model discovery HTTP ${response.status}`)
  const result: unknown = await response.json()
  if (typeof result !== "object" || result === null || !("data" in result) || !Array.isArray(result.data))
    throw new Error("Endpoint did not return an OpenAI-compatible models list")
  const entries: unknown[] = result.data
  return entries.flatMap((entry) => (typeof entry === "object" && entry !== null && "id" in entry && typeof entry.id === "string" ? [entry.id] : []))
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

export async function localDecisions(request: DecisionRequest, signal: AbortSignal) {
  const settings = requireSettings()
  const items = Object.entries(request.questions)
  const questions = items.map(([key, question]) => {
    if (question.type === "noul")
      return `${key}: Give a probability from 0 to 1. ${question.instructions} True: ${question.criteria?.true_description ?? "yes"}. False: ${question.criteria?.false_description ?? "no"}.`
    if (question.type === "score")
      return `${key}: Choose exactly one integer 0..${question.criteria.length - 1}. ${question.instructions} Levels: ${question.criteria.map((label, index) => `${index}=${label}`).join("; ")}.`
    return `${key}: Choose exactly one option key. ${question.instructions} Options: ${JSON.stringify(question.criteria)}.`
  })
  const content = await completeChat(
    `${settings.endpoint}/chat/completions`,
    {
      ...NON_THINKING,
      model: settings.decision,
      temperature: 0,
      max_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Evaluate the questions using only the supplied text. Reply with one JSON object whose keys are the question IDs and values are the requested numbers or option keys. No explanation.",
        },
        {
          role: "user",
          content: `INPUT\n${typeof request.input === "string" ? request.input : JSON.stringify(request.input)}\n\nQUESTIONS\n${questions.join("\n")}`,
        },
      ],
    },
    signal,
  )
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null) throw new Error("Decision model returned invalid JSON")
  const values = "answers" in parsed && typeof parsed.answers === "object" && parsed.answers !== null ? parsed.answers : parsed
  const answers: Record<string, Answer> = {}
  for (const [key, question] of items) {
    const value = Object.hasOwn(values, key) ? Reflect.get(values, key) : undefined
    if (question.type === "score" && typeof value === "number" && Number.isInteger(value) && value >= 0 && value < question.criteria.length) {
      answers[key] = { type: "score", score: value, probabilities: {}, legend: {}, confidence: 0 }
      continue
    }
    if (question.type === "noul" && typeof value === "number" && value >= 0 && value <= 1) {
      answers[key] = { type: "noul", noul: value, confidence: 0 }
      continue
    }
    if (question.type === "choice" && typeof value === "string" && Object.hasOwn(question.criteria, value)) {
      answers[key] = { type: "choice", choice: value, probabilities: {}, confidence: 0 }
      continue
    }
    throw new Error(`Decision model returned invalid value for ${key}: ${String(value)}`)
  }
  return { answers }
}
