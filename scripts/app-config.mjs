import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

export function readAppConfig() {
  const filename = process.env.SPACESHIP_CONFIG ?? "spaceship.config.json"
  if (!filename) return undefined
  const path = resolve(filename)
  if (!existsSync(path)) {
    if (process.env.SPACESHIP_CONFIG !== undefined) throw new Error("Missing model config: " + path)
    return undefined
  }
  const config = JSON.parse(readFileSync(path, "utf8"))
  for (const role of ["writer", "decision"]) {
    const server = config?.[role]
    if (
      typeof server?.endpoint !== "string" ||
      typeof server.model !== "string" ||
      typeof server.command !== "string" ||
      !Array.isArray(server.args) ||
      !server.args.every((arg) => typeof arg === "string")
    ) {
      throw new Error("Invalid " + role + " in " + path)
    }
    const url = new URL(server.endpoint)
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname.replace(/\/+$/, "") !== "/v1") {
      throw new Error(role + " endpoint must be a loopback /v1 URL")
    }
  }
  return config
}
