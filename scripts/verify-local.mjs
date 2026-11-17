import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"

const PORT = 5178
const models = ["fixture-writer", "fixture-decision"]
const calls = { stream: 0, decision: 0, nonThinking: 0 }

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*")
  response.setHeader("Access-Control-Allow-Headers", "Content-Type")
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  if (request.method === "OPTIONS") return void response.writeHead(204).end()
  if (request.url === "/v1/models") {
    response.setHeader("Content-Type", "application/json")
    return void response.end(JSON.stringify({ data: models.map((id) => ({ id })) }))
  }
  if (request.url !== "/v1/chat/completions") return void response.writeHead(404).end()
  let raw = ""
  request.on("data", (chunk) => (raw += chunk))
  request.on("end", () => {
    const input = JSON.parse(raw)
    if (input.reasoning_effort === "none") calls.nonThinking++
    if (input.stream) {
      calls.stream++
      response.setHeader("Content-Type", "text/event-stream")
      const words = Array.from({ length: 170 }, (_, i) => (i % 3 === 0 ? "lantern" : "glowed")).join(" ")
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: ` ${words}` } }] })}\n\ndata: [DONE]\n\n`)
      return
    }
    calls.decision++
    const prompt = input.messages[1].content
    const values = Object.fromEntries(
      [...prompt.matchAll(/^(\w+): (.+)$/gm)].map(([, id, question]) => [id, question.startsWith("Choose exactly one integer") ? 2 : 0.75]),
    )
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(values) } }] }))
  })
})

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const endpoint = `http://127.0.0.1:${server.address().port}/v1`
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  stdio: "pipe",
})
let browser
try {
  const url = `http://127.0.0.1:${PORT}/spaceship/`
  let ready = false
  for (let attempt = 0; attempt < 35; attempt++) {
    if (vite.exitCode !== null) throw new Error("Vite exited before serving the app")
    try {
      if ((await fetch(url)).ok) {
        ready = true
        break
      }
    } catch {
      await delay(150)
    }
  }
  assert.ok(ready, "Vite did not become ready")
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] })
  const page = await browser.newPage()
  const pageErrors = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto(url)
  await page.locator("#mode-toggle").click()
  await page.locator('input[name="endpoint"]').fill(endpoint)
  await page.locator("#discover-models").click()
  await page.waitForFunction(() => document.querySelector("#connection-status")?.textContent?.includes("Connected"))
  assert.equal(await page.locator("#local-models option").count(), 2)
  await page.locator('input[name="writer"]').fill(models[0])
  await page.locator('input[name="decision"]').fill(models[1])
  await Promise.all([page.waitForURL("**/spaceship/?live=local"), page.locator('button[type="submit"]').click()])
  assert.equal(await page.locator("#mode-toggle b").textContent(), "local")
  await page.waitForFunction(() => Number(document.querySelector('#status [data-field="words"] small')?.textContent?.slice(1)) > 0, { timeout: 10000 })
  assert.ok(calls.stream > 0, "local generation did not stream")
  const answers = await page.evaluate(async () => {
    const { scoreDecisions } = await import("/spaceship/src/llm/inference.ts")
    return (
      await scoreDecisions(
        {
          model: "ignored-for-local",
          input: "A lantern glowed in the hall.",
          questions: {
            k1: { type: "score", instructions: "How relevant is lantern?", criteria: ["none", "weak", "strong"] },
            s1: { type: "noul", instructions: "Did the lantern glow?" },
          },
        },
        new AbortController().signal,
      )
    ).answers
  })
  assert.equal(answers.k1.score, 2)
  assert.equal(answers.s1.noul, 0.75)
  assert.ok(calls.decision > 0, "local decisions did not reach the server")
  assert.ok(calls.nonThinking >= 2, "local inference must disable reasoning for visible output")
  await page.locator("#mode-toggle").click()
  assert.equal(await page.locator("#mode-toggle b").textContent(), "sim")
  await page.locator("#mode-toggle").click()
  await page.locator('input[value="cloud"]').check()
  assert.equal(await page.locator('fieldset[data-provider="cloud"]').isVisible(), true)
  assert.equal(await page.locator('fieldset[data-provider="local"]').isVisible(), false)
  assert.deepEqual(pageErrors, [])
  console.log("PASS: browser discovery, local streaming, scoring, and cloud/sim switching")
} finally {
  await browser?.close()
  vite.kill("SIGTERM")
  await new Promise((resolve) => server.close(resolve))
}
