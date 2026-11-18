import { KEY_STORAGE as CEREBRAS_KEY_STORAGE } from "../llm/cerebras.ts"
import { KEY_STORAGE as GEMINI_KEY_STORAGE } from "../llm/decisions.ts"
import { configuredLocalSettings, createLocalSettings, DEFAULT_LOCAL_ENDPOINT, listLocalModels, saveLocalSettings, storedLocalSettings } from "../llm/local.ts"
import { probeSystemOne } from "../llm/systemone.ts"
import type { InferenceMode } from "../llm/mode.ts"

const KEY_FIELDS = { cerebras: CEREBRAS_KEY_STORAGE, gemini: GEMINI_KEY_STORAGE }

/** The simulator, cloud models, and local models share the same steering UI. */
export function bindModeToggle(toggle: HTMLButtonElement, dialog: HTMLDialogElement, mode: InferenceMode) {
  const form = dialog.querySelector("form")!
  const inputOf = (name: string) => form.elements.namedItem(name) as HTMLInputElement
  const localFields = form.querySelector<HTMLFieldSetElement>('fieldset[data-provider="local"]')!
  const cloudFields = form.querySelector<HTMLFieldSetElement>('fieldset[data-provider="cloud"]')!
  const modelList = form.querySelector<HTMLDataListElement>("#local-models")!
  const decisionModelList = form.querySelector<HTMLDataListElement>("#decision-models")!
  const status = form.querySelector<HTMLOutputElement>("#connection-status")!
  const selectedProvider = () => form.querySelector<HTMLInputElement>('input[name="provider"]:checked')!.value

  toggle.setAttribute("aria-pressed", String(mode !== "sim"))
  toggle.querySelector("b")!.textContent = mode === "cloud" ? "flight" : mode

  toggle.addEventListener("click", () => {
    if (mode !== "sim") return reloadAs("sim")
    for (const [name, storageKey] of Object.entries(KEY_FIELDS)) inputOf(name).value = localStorage.getItem(storageKey) ?? ""
    const settings = storedLocalSettings()
    inputOf("endpoint").value = settings?.endpoint ?? DEFAULT_LOCAL_ENDPOINT
    inputOf("writer").value = settings?.writer ?? ""
    inputOf("decision").value = settings?.decision ?? ""
    inputOf("decisionEndpoint").value = settings?.decisionEndpoint ?? ""
    for (const field of ["endpoint", "writer", "decisionEndpoint", "decision"]) inputOf(field).readOnly = !!configuredLocalSettings
    selectProvider()
    dialog.showModal()
  })

  form.querySelectorAll<HTMLInputElement>('input[name="provider"]').forEach((radio) => radio.addEventListener("change", selectProvider))
  form.querySelector<HTMLButtonElement>("#discover-models")!.addEventListener("click", () => discoverModels("endpoint", modelList))
  form.querySelector<HTMLButtonElement>("#discover-decisions")!.addEventListener("click", () => discoverModels("decisionEndpoint", decisionModelList))

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (selectedProvider() === "cloud") {
      for (const [name, storageKey] of Object.entries(KEY_FIELDS)) localStorage.setItem(storageKey, inputOf(name).value.trim())
      reloadAs("cloud")
      return
    }
    try {
      const settings = createLocalSettings({
        endpoint: inputOf("endpoint").value,
        writer: inputOf("writer").value,
        decisionEndpoint: inputOf("decisionEndpoint").value,
        decision: inputOf("decision").value,
      })
      await listLocalModels(settings.endpoint)
      status.textContent = "Probing native System One decision model…"
      await probeSystemOne(settings.decisionEndpoint, settings.decision)
      saveLocalSettings(settings)
      reloadAs("local")
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
    }
  })

  function selectProvider() {
    const isLocal = selectedProvider() === "local"
    localFields.hidden = !isLocal
    localFields.disabled = !isLocal
    cloudFields.hidden = isLocal
    cloudFields.disabled = isLocal
    status.textContent = isLocal && configuredLocalSettings ? "Models configured in spaceship.config.json. Restart the dev server after edits." : ""
  }

  async function discoverModels(endpointName: "endpoint" | "decisionEndpoint", list: HTMLDataListElement) {
    status.textContent = "Connecting to local model server…"
    try {
      const models = await listLocalModels(inputOf(endpointName).value)
      list.replaceChildren(...models.map((id) => Object.assign(document.createElement("option"), { value: id })))
      status.textContent = `Connected. ${models.length} models available.`
    } catch (error) {
      status.textContent = `Connection failed: ${error instanceof Error ? error.message : String(error)}. Check the server, CORS, and browser loopback permission.`
    }
  }
}

function reloadAs(mode: InferenceMode) {
  const url = new URL(location.href)
  if (mode === "sim" && !configuredLocalSettings) url.searchParams.delete("live")
  else url.searchParams.set("live", mode === "sim" ? "sim" : mode === "cloud" ? "true" : "local")
  location.assign(url)
}
