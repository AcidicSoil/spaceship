import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"

const directory = mkdtempSync(join(tmpdir(), "spaceship-servers-"))
const freePort = async () => {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
const ports = await Promise.all([freePort(), freePort(), freePort()])
const fixturePath = join(directory, "fixture.mjs")
writeFileSync(
  fixturePath,
  [
    'import { createServer } from "node:http"',
    'import { writeFileSync } from "node:fs"',
    "writeFileSync(process.argv[4], String(process.pid))",
    "createServer((request, response) => {",
    '  if (request.url !== "/v1/models") return void response.writeHead(404).end()',
    '  response.setHeader("Content-Type", "application/json")',
    "  response.end(JSON.stringify({ data: [{ id: process.argv[3] }] }))",
    '}).listen(Number(process.argv[2]), "127.0.0.1")',
  ].join("\n"),
)
const config = {
  writer: {
    endpoint: "http://127.0.0.1:" + ports[0] + "/v1",
    model: "test-writer",
    command: process.execPath,
    args: [fixturePath, String(ports[0]), "test-writer", join(directory, "writer.pid")],
  },
  decision: {
    endpoint: "http://127.0.0.1:" + ports[1] + "/v1",
    model: "test-decision",
    command: process.execPath,
    args: [fixturePath, String(ports[1]), "test-decision", join(directory, "decision.pid")],
  },
}
const configPath = join(directory, "spaceship.config.json")
writeFileSync(configPath, JSON.stringify(config))
const app = spawn(process.execPath, ["scripts/dev.mjs", "--host", "127.0.0.1", "--port", String(ports[2]), "--strictPort"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, SPACESHIP_CONFIG: configPath },
  stdio: "ignore",
})
let succeeded = false
let browser
try {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (app.exitCode !== null) throw new Error("Dev server exited: " + app.exitCode)
    try {
      const response = await fetch("http://127.0.0.1:" + ports[2] + "/spaceship/")
      if (response.ok) {
        succeeded = true
        break
      }
    } catch {
      // The real managed servers and Vite are still starting.
    }
    await delay(250)
  }
  assert.ok(succeeded, "Dev server did not start configured models")
  for (const role of ["writer", "decision"]) {
    const response = await fetch(config[role].endpoint + "/models")
    assert.equal(response.status, 200)
    assert.equal((await response.json()).data[0].id, config[role].model)
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] })
  const page = await browser.newPage()
  await page.goto("http://127.0.0.1:" + ports[2] + "/spaceship/")
  const settings = await page.evaluate(async () => (await import("/spaceship/src/llm/local.ts")).storedLocalSettings())
  assert.equal(settings.writer, config.writer.model)
  assert.equal(settings.decision, config.decision.model)
  assert.equal(await page.evaluate(async () => (await import("/spaceship/src/llm/mode.ts")).currentMode()), "local")
  await page.goto("http://127.0.0.1:" + ports[2] + "/spaceship/?live=sim")
  assert.equal(await page.evaluate(async () => (await import("/spaceship/src/llm/mode.ts")).currentMode()), "sim")
  await page.locator("#mode-toggle").click()
  for (const name of ["endpoint", "writer", "decisionEndpoint", "decision"]) {
    assert.equal(await page.locator('input[name="' + name + '"]').evaluate((input) => input.readOnly), true)
  }
  console.log("PASS: managed startup, model settings, LOCAL default, SIM override, and read-only controls")
} finally {
  await browser?.close()
  app.kill("SIGTERM")
  await delay(1200)
  for (const role of ["writer", "decision"]) {
    const file = join(directory, role + ".pid")
    try {
      const pid = Number(readFileSync(file, "utf8"))
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, role + " service was not stopped")
    } catch (error) {
      if (succeeded) throw error
    }
  }
  rmSync(directory, { recursive: true, force: true })
}
