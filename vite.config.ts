import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"
import { readAppConfig } from "./scripts/app-config.mjs"

export default defineConfig(({ command }) => {
  const config = command === "serve" ? readAppConfig() : undefined
  const settings = config && {
    endpoint: config.writer.endpoint,
    writer: config.writer.model,
    decisionEndpoint: config.decision.endpoint,
    decision: config.decision.model,
  }
  return {
    base: "/spaceship/",
    define: {
      __SPACESHIP_CONFIG__: settings ? JSON.stringify(settings) : "undefined",
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, "index.html"),
          ...Object.fromEntries(
            readdirSync(resolve(import.meta.dirname, "extra"))
              .filter((file) => file.endsWith(".html"))
              .map((file) => ["extra/" + file.slice(0, -".html".length), resolve(import.meta.dirname, "extra", file)]),
          ),
        },
      },
    },
  }
})
