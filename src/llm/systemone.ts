import type { Answer, DecisionRequest, Question } from "./decisions.ts"
import { storedLocalSettings } from "./local.ts"
import { postModelRequest } from "./transport.ts"

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
}

function requireProbabilities(value: unknown, keys: string[]): Record<string, number> {
  if (!isRecord(value)) throw new Error("Decision model omitted native probability distributions")
  const probabilities: Record<string, number> = {}
  for (const key of keys) {
    const probability = value[key]
    if (!isProbability(probability)) throw new Error("Decision model omitted native probability distributions")
    probabilities[key] = probability
  }
  return probabilities
}

function parseAnswer(value: unknown, question: Question): Answer {
  if (!isRecord(value) || value.type !== question.type) throw new Error(`Invalid native ${question.type} answer`)
  if (question.type === "noul") {
    if (!isProbability(value.noul)) throw new Error("Native Noul requires a probability in [0,1]")
    return { type: "noul", noul: value.noul }
  }
  if (!isProbability(value.confidence)) throw new Error("Native decision confidence is missing or invalid")
  if (question.type === "choice") {
    const keys = Object.keys(question.criteria)
    if (typeof value.choice !== "string" || !keys.includes(value.choice)) throw new Error("Invalid native Choice result")
    const probabilities = requireProbabilities(value.probabilities, keys)
    return { type: "choice", choice: value.choice, probabilities, confidence: value.confidence }
  }
  const levels = question.criteria.map((_, index) => String(index))
  if (typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || value.score > levels.length - 1) {
    throw new Error("Invalid native Score result")
  }
  const probabilities = requireProbabilities(value.probabilities, levels)
  if (!isRecord(value.legend)) throw new Error("Native Score legend is missing or invalid")
  const legend: Record<string, string> = {}
  for (const key of levels) {
    const label = value.legend[key]
    if (typeof label !== "string") throw new Error("Native Score legend is missing or invalid")
    legend[key] = label
  }
  return { type: "score", score: value.score, probabilities, legend, confidence: value.confidence }
}

/** The native System One contract. Chat-completion JSON is not a decision model. */
export async function requestSystemOne(endpoint: string, model: string, request: DecisionRequest, signal: AbortSignal) {
  const response = await postModelRequest(`${endpoint}/systemone`, { model, state: request.input, questions: request.questions }, signal)
  const result: unknown = await response.json()
  if (!isRecord(result) || !isRecord(result.answers)) throw new Error("Endpoint does not implement native System One decisions")
  const answers: Record<string, Answer> = {}
  for (const [key, question] of Object.entries(request.questions)) {
    answers[key] = parseAnswer(result.answers[key], question)
  }
  return { answers }
}

export function localDecisions(request: DecisionRequest, signal: AbortSignal) {
  const settings = storedLocalSettings()
  if (!settings) throw new Error("Configure a native System One decision endpoint first")
  return requestSystemOne(settings.decisionEndpoint, settings.decision, request, signal)
}

/** Probe actual native semantics; model discovery alone cannot establish decision support. */
export async function probeSystemOne(endpoint: string, model: string) {
  await requestSystemOne(
    endpoint,
    model,
    {
      model,
      input: "A lantern glows in a quiet library.",
      questions: {
        present: { type: "noul", instructions: "Does the scene contain a lantern?" },
        setting: {
          type: "choice",
          instructions: "Where is this scene set?",
          criteria: { library: "A library", garden: "A garden" },
        },
        intensity: {
          type: "score",
          instructions: "How intense is the scene?",
          criteria: ["Calm", "Mildly tense", "Very tense"],
        },
      },
    },
    new AbortController().signal,
  )
}
