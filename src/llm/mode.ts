import { configuredLocalSettings } from "./local.ts"

export type InferenceMode = "sim" | "cloud" | "local"

export function currentMode(): InferenceMode {
  const mode = new URLSearchParams(location.search).get("live")
  if (mode === "local" || (!mode && configuredLocalSettings)) return "local"
  return mode === "true" ? "cloud" : "sim"
}
