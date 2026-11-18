# Local inference

Spaceship's **LOCAL** mode accepts two independent loopback endpoints. The application connects to running services; each service is started and managed externally.

| Role      | Required API                                                 | Model selection                                                        |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Writing   | OpenAI-compatible `POST /v1/chat/completions` with streaming | Any model supported by that endpoint                                   |
| Decisions | Native System One `POST /v1/systemone`                       | A model that implements native `noul`, `choice`, and `score` responses |

## Configure

1. Start compatible writing and decision servers using their own documentation.
2. Run `npm ci && npm run dev` and select **mode → local**.
3. Enter each server's `/v1` base URL and model ID. **Detect** lists models at each endpoint.
4. Select **launch**. Spaceship probes the decision server with all three question types and refuses unsupported responses.

Endpoints must be reachable from the browser through loopback (for example, `http://127.0.0.1:<port>/v1`). The servers must permit the browser origin through CORS. A hosted HTTPS page may require browser **Loopback network** permission.

Writing and decision inference remain separate. The decision adapter preserves native probability distributions, fractional scores, legends, and confidence; chat-generated JSON is not used as a substitute.

## Verify

```sh
npm run build
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
