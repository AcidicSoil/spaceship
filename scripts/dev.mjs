import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { readAppConfig } from "./app-config.mjs"

const owned = []
let vite
let stopping = false

function stop() {
  stopping = true
  if (vite?.exitCode === null) vite.kill("SIGTERM")
  for (const child of owned) {
    if (child.exitCode === null) child.kill("SIGTERM")
  }
}

async function ready(server, role) {
  let response
  try {
    response = await fetch(server.endpoint + "/models", { signal: AbortSignal.timeout(1500) })
  } catch {
    return false
  }
  if (!response.ok) return false
  const catalog = await response.json()
  const models = catalog.data ?? catalog.models
  const ids = Array.isArray(models) ? models.map((item) => (typeof item === "string" ? item : (item.id ?? item.name))) : []
  if (!ids.includes(server.model)) {
    throw new Error(role + " server at " + server.endpoint + " does not list model " + server.model)
  }
  return true
}

async function start(role, server) {
  if (await ready(server, role)) {
    console.log("[spaceship] Reusing " + role + " server at " + server.endpoint)
    return
  }
  console.log("[spaceship] Starting " + role + ": " + server.command)
  const child = spawn(
    server.command,
    server.args.map((arg) => arg.replaceAll("{model}", server.model)),
    { stdio: "inherit" },
  )
  owned.push(child)
  let startupError
  child.on("error", (error) => {
    startupError = error
  })
  for (let attempt = 0; attempt < 120; attempt++) {
    if (stopping) throw new Error("Startup cancelled")
    if (startupError) throw startupError
    if (child.exitCode !== null) throw new Error(role + " server exited with code " + child.exitCode)
    if (await ready(server, role)) return
    await delay(500)
  }
  throw new Error(role + " server was not ready at " + server.endpoint)
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)

try {
  const config = readAppConfig()
  if (config) {
    for (const role of ["writer", "decision"]) await start(role, config[role])
  }
  if (!stopping) {
    vite = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), ...process.argv.slice(2)], { stdio: "inherit" })
    const result = await new Promise((resolve) => {
      vite.once("error", (error) => resolve({ error }))
      vite.once("exit", (code, signal) => resolve({ code, signal }))
    })
    if (result.error) throw result.error
    process.exitCode = result.code ?? (stopping ? 0 : 1)
  }
} catch (error) {
  console.error("[spaceship] " + (error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
} finally {
  stop()
}
