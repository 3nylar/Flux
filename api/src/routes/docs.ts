import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Local/Docker runs compiled output from dist/routes, two levels below the
// package root. Vercel's own bundler for index.ts doesn't preserve that
// layout, but does run with cwd at the project root, so docs/openapi.yaml
// is reachable from there instead (see vercel.json's includeFiles).
const candidatePaths = [
  join(__dirname, "..", "..", "docs", "openapi.yaml"),
  join(process.cwd(), "docs", "openapi.yaml"),
];

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  let spec = "";
  for (const specPath of candidatePaths) {
    try {
      spec = readFileSync(specPath, "utf8");
      break;
    } catch {
      continue;
    }
  }
  if (!spec) {
    spec = "openapi: 3.1.0\ninfo:\n  title: Flux API\n  version: '1.0.0'\npaths: {}\n";
  }

  app.get("/openapi.yaml", async (_req, reply) => {
    reply.header("content-type", "application/yaml");
    return spec;
  });

  app.get("/docs", async (_req, reply) => {
    reply.header("content-type", "text/html");
    return DOCS_HTML;
  });
}

const DOCS_HTML = `<!doctype html>
<html>
  <head>
    <title>Flux API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/openapi.yaml"
      data-configuration='{"theme":"purple","layout":"modern"}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
