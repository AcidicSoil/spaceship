# Local inference

Spaceship's **LOCAL** mode uses two independent loopback endpoints. In development, `npm run dev` starts the configured writing and decision servers, reuses an already-running compatible server, and stops only processes it started when the app exits.

Copy `spaceship.config.example.json` to `spaceship.config.json` and edit the writing model, decision model, endpoint URLs, and server commands. The actual config is Git-ignored, so local model paths stay on your machine. The `{model}` argument placeholder resolves to the configured model ID.

| Role      | Required API                                                 | Model selection                                                        |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Writing   | OpenAI-compatible `POST /v1/chat/completions` with streaming | Any model supported by that endpoint                                   |
| Decisions | Native System One `POST /v1/systemone`                       | A model that implements native `noul`, `choice`, and `score` responses |

## Configure

1. Configure both servers in `spaceship.config.json`. For a native System One decision model, use a compatible `llama-server` command; for writing, use any OpenAI-compatible backend.
2. Run `npm ci` once, then `npm run dev` to launch the servers and the app.
3. Open the Vite URL. LOCAL mode activates automatically from the config. Use the **mode** control to switch to SIM or cloud.

The app verifies that each configured server exposes its model through `/v1/models` before starting Vite. The local launch dialog displays file-managed settings as read-only; edit the JSON and restart `npm run dev` to change them. Without a config file, the simulator and manual local/cloud setup remain available.

Endpoints must be reachable from the browser through loopback (for example, `http://127.0.0.1:<port>/v1`). The servers must permit the browser origin through CORS. A hosted HTTPS page may require browser **Loopback network** permission.

Writing and decision inference remain separate. The decision adapter preserves native probability distributions, fractional scores, legends, and confidence; chat-generated JSON is not used as a substitute.

## Verify

```sh
npm run build
node scripts/verify-dev-start.mjs
node scripts/verify-local.mjs
```

The browser test uses an isolated local HTTP fixture. To additionally exercise a running native decision server, set its URL explicitly:

```sh
SPACESHIP_NATIVE_ENDPOINT=http://127.0.0.1:<port>/v1 node scripts/verify-local.mjs
```

## Implementation

- `src/llm/local.ts` handles endpoint configuration, discovery, and writer streaming.
- `src/llm/systemone.ts` validates native decision responses and probes capabilities.
- `src/llm/transport.ts` owns shared HTTP and SSE communication.
- `src/llm/inference.ts` selects local or cloud inference.

Protocol reference: [System One API](https://docs.system-one.dev/en/docs/api).
