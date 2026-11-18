# Local inference and native decision models

## Workflow

1. Start a local OpenAI-compatible **writing model** using Ollama or llama.cpp.
2. Run `jev-droid models` to find a local System One decision profile and its endpoint. For the installed default Laya profile, `jev-droid --model default serve` starts the native runtime with its managed idle-unload policy.
3. Start Spaceship with `npm ci && npm run dev`. Open **mode → local**.
4. Enter the writing endpoint and model, and separately enter the **decision endpoint** and decision model. Use each **detect** button to list models.
5. Select **launch**. Spaceship sends a real mixed `noul` / `choice` / `score` capability probe to `/v1/systemone` before entering LOCAL mode.
6. Use the existing attention, future-knob, and regeneration controls. Returning to SIM does not shut down externally managed servers.

The app does not own model processes. Keep lifecycle management with `jev-droid` or the serving runtime. Launching a decision service is an explicit prerequisite; the browser does not silently start models.

## Architecture

| Module                  | Responsibility                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `src/llm/local.ts`      | Validate and persist separate local endpoints and model choices; discover models; stream writing |
| `src/llm/systemone.ts`  | Native decision requests, response validation, and capability probe                              |
| `src/llm/transport.ts`  | Shared HTTP/SSE and loopback access                                                              |
| `src/llm/inference.ts`  | Dispatch cloud versus local operations                                                           |
| `src/text/live-mode.ts` | Mode selection and model configuration                                                           |

**Writer** uses `POST {writingEndpoint}/chat/completions` with streamed text. **Decision model** uses the native `POST {decisionEndpoint}/systemone` contract:

```json
{
  "model": "SELECTED_NATIVE_MODEL",
  "state": "A lantern glows in a library.",
  "questions": {
    "present": { "type": "noul", "instructions": "Is there a lantern?" },
    "setting": { "type": "choice", "instructions": "Where is it?", "criteria": { "library": "Library", "garden": "Garden" } },
    "tension": { "type": "score", "instructions": "How tense is it?", "criteria": ["Calm", "Tense", "Intense"] }
  }
}
```

The adapter preserves native probabilities, fractional score, legend, and confidence. `noul` has a probability without a separate confidence field. It rejects incorrect or incomplete typed responses and never falls back to chat-based JSON scoring.

**Model selection:** Writer and decision endpoints can be different servers. Their `/v1/models` catalogs can use OpenAI's `data[].id` or System One's `models[].name`. Native capability is established by a real probe, not inferred from a model name or catalog entry. Previously saved chat-scoring selections must be reconfigured.

**Browser:** Both endpoints must be reachable from the browser and permit its origin through CORS. Public HTTPS origins may require Chromium's Loopback network permission. Local endpoints are restricted to the loopback interface to avoid sending writing or decision input to remote services.

**Caveat:** Native probability availability is verified, but model calibration and task-level decision quality require separate evaluation. The existing Gemini Decisions cloud route remains unchanged.

## Verification

- `npm run build` checks TypeScript and bundles the app.
- `node scripts/verify-local.mjs` runs Chromium against two kinds of local API contracts: streamed writing and native typed decisions. It tests real HTTP requests, preserved fractional scores/distributions, a mixed-question launch probe, and fail-closed behavior.
- A real Laya Q8 native runtime served `/v1/systemone` with `noul`, `choice`, and fractional `score` results in one request. Browser-origin CORS was present, and its port closed after the managed serving process exited.

## Decision

Duplicating the live steering sources or using chat completion for typed decisions would conflate generation with inference. The selected design keeps the existing UI source contracts and gives native decision inference its own endpoint and validation boundary.

**Sources:** [System One API](https://docs.system-one.dev/en/docs/api), locally installed `jev-droid` System One profile, and the repository's verified `src/llm/decisions.ts` contracts.
