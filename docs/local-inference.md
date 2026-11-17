# Local inference integration

## User journey

1. Start the app in **SIM**.
2. Select **mode → local** and enter an OpenAI-compatible loopback URL.
3. Select **detect models**, then choose generation and decision models.
4. Select **launch**. The app verifies discovery, saves the local selection, and switches to **LOCAL**.
5. Use the unchanged main knob, attention boxes, future knobs, and backward scrubbing.
6. Select **mode** to return to SIM. Cloud mode remains available.

## Design decision

Spaceship already has two input contracts: `TextSource` for abortable generation, and scored decision sources for attention, relevance, influence, and realization. Keep both contracts; route them through a single provider boundary in `src/llm/inference.ts`.

Two designs were compared:

- **Duplicate all live sources for local inference.** Rejected. This copies prompts, controls, and behavior across multiple implementations.
- **Keep the source contracts and switch at inference.** Chosen. Each source retains its existing API; one module selects local or cloud implementations.

Ownership:

| Module                  | Responsibility                                                |
| ----------------------- | ------------------------------------------------------------- |
| `src/llm/mode.ts`       | SIM/CLOUD/LOCAL URL state                                     |
| `src/llm/inference.ts`  | Provider dispatch                                             |
| `src/llm/local.ts`      | Loopback settings, discovery, generation, decision conversion |
| `src/llm/openai.ts`     | Shared OpenAI-compatible JSON/SSE transport                   |
| `src/text/live-mode.ts` | User-selected endpoint and models                             |

## Local decision contract

The decision model receives an existing `DecisionRequest` as a JSON-only prompt. For `score` questions it must return an integer level index; for `noul` it must return a number in [0,1]; for `choice` it must return an option key. The local adapter validates each answer before returning the corresponding existing decision result.

It does not claim to provide the token-probability distributions exposed by the Gemini Decisions API. Its confidence fields are placeholders for the app's existing result type; decision-model scoring quality depends on the selected local model and should be evaluated on real output.

## Supported services

- LM Studio: `http://127.0.0.1:1234/v1`
- Ollama: `http://127.0.0.1:11434/v1`
- llama.cpp server: `http://127.0.0.1:8080/v1`

Both models can use the same server. OpenAI-compatible local requests use reasoning_effort=none because the installed Qwen3.5 model otherwise spent its entire small response budget on reasoning without producing visible content. The browser must reach its own loopback endpoint. If using WSL, confirm that the model server is reachable from the browser OS. Cloud mode continues using the original API keys, while local mode requires no cloud keys.

The endpoint must permit the app origin via CORS. Chromium may ask for **Loopback network** access from a public HTTPS page; localhost-based development does not cross into a more private address space.

## Verification

- `npm run build`: TypeScript and production bundle.
- `node scripts/verify-local.mjs`: real Chromium and loopback HTTP fixture for discovery, generation streaming, scoring, and mode switching.
- Real-model check: verify model listing plus streamed and JSON-mode requests directly against the selected installed model.
- `git diff --check`: whitespace and patch validity.

## Decision trail

| Gate             | Evidence                                             | Result                  |
| ---------------- | ---------------------------------------------------- | ----------------------- |
| Source contracts | `src/text/text-stream.ts`, `src/llm/decisions.ts`    | Reusable                |
| Model servers    | LM Studio :1234, Ollama :11434 `/v1/models` and CORS | Reachable               |
| UI reuse         | One route selector and shared live-source set        | Build verified          |
| Behavior         | Browser smoke and installed-model requests           | See current test output |
