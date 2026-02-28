import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createProgram } from "../cli/program.js";
import { runCommand } from "../utils/process.js";

interface JsonObject {
  [key: string]: unknown;
}

const MAX_BODY_BYTES = 512 * 1024;
const APP_VERSION = "0.1.1";

function readPort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? "8080", 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    return 8080;
  }
  return parsed;
}

function sendJson(response: ServerResponse, statusCode: number, body: JsonObject): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

function renderHomePage(): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StagePilot API</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
        background: linear-gradient(135deg, #f5f7ff 0%, #edf9ff 100%);
        color: #0d1b2a;
      }
      .wrap {
        max-width: 980px;
        margin: 40px auto;
        padding: 24px;
      }
      .card {
        background: #fff;
        border: 1px solid #dce8ff;
        border-radius: 14px;
        box-shadow: 0 16px 28px rgba(17, 40, 89, 0.08);
        padding: 24px;
      }
      h1 { margin: 0 0 6px; font-size: 30px; }
      .muted { color: #476082; margin: 0 0 18px; }
      .badge {
        display: inline-block;
        background: #e7f3ff;
        color: #0b4da2;
        border: 1px solid #c6ddff;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 10px;
        margin-bottom: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 18px 0;
      }
      .box {
        border: 1px solid #e1e9f7;
        border-radius: 10px;
        padding: 12px;
        background: #f9fcff;
      }
      code {
        background: #f3f7ff;
        border: 1px solid #dce6fa;
        border-radius: 8px;
        padding: 2px 6px;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
      }
      .row { margin-top: 14px; }
      button {
        background: #1155cc;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
        font-weight: 600;
      }
      button:hover { background: #0d47ae; }
      #output {
        margin-top: 12px;
        border: 1px solid #dce6fa;
        border-radius: 10px;
        padding: 12px;
        background: #f6f9ff;
        min-height: 56px;
      }
      a { color: #0d47ae; text-decoration: none; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        <span class="badge">Cloud Run Live</span>
        <h1>Seoul Welfare Navigator (StagePilot)</h1>
        <p class="muted">This URL is running. API and health routes are available.</p>
        <div class="grid">
          <div class="box"><strong>Health</strong><br /><code>/health</code></div>
          <div class="box"><strong>Version</strong><br /><code>/v1/version</code></div>
          <div class="box"><strong>Doctor (POST)</strong><br /><code>/v1/doctor</code></div>
        </div>
        <div class="row">
          <button id="btnHealth">Check Health</button>
          <button id="btnVersion">Check Version</button>
          <button id="btnDoctor">Run Doctor</button>
        </div>
        <div id="output"><pre>Ready</pre></div>
        <div class="row muted">
          API index JSON: <a href="/api">/api</a>
        </div>
      </section>
    </main>
    <script>
      const output = document.getElementById("output");
      function show(data) {
        output.innerHTML = "<pre>" + JSON.stringify(data, null, 2) + "</pre>";
      }
      document.getElementById("btnHealth").addEventListener("click", async () => {
        const r = await fetch("/health");
        show(await r.json());
      });
      document.getElementById("btnVersion").addEventListener("click", async () => {
        const r = await fetch("/v1/version");
        show(await r.json());
      });
      document.getElementById("btnDoctor").addEventListener("click", async () => {
        const r = await fetch("/v1/doctor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope: "project" })
        });
        show(await r.json());
      });
    </script>
  </body>
</html>`;
}

function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
        resolve(parsed ?? {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function runDoctor(scope: string): Promise<JsonObject> {
  const result = await runCommand("node", ["dist/bin/ogx.js", "doctor", "--scope", scope], {
    timeoutMs: 20_000,
  });
  return {
    code: result.code,
    ok: result.code === 0,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = request.url ?? "/";

  if (method === "GET" && url === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "oh-my-gemini-api",
      version: APP_VERSION,
    });
    return;
  }

  if (method === "GET" && url === "/") {
    sendHtml(response, 200, renderHomePage());
    return;
  }

  if (method === "GET" && url === "/api") {
    sendJson(response, 200, {
      message: "oh-my-gemini Cloud Run API",
      routes: ["/health", "/v1/doctor", "/v1/version"],
    });
    return;
  }

  if (method === "GET" && url === "/v1/version") {
    const program = createProgram();
    sendJson(response, 200, {
      name: program.name(),
      version: program.version(),
      description: program.description(),
    });
    return;
  }

  if (method === "POST" && url === "/v1/doctor") {
    try {
      const body = await readJsonBody(request);
      const scopeRaw = typeof body.scope === "string" ? body.scope.trim() : "";
      const scope = scopeRaw === "user" ? "user" : "project";
      const doctor = await runDoctor(scope);
      sendJson(response, 200, {
        ok: true,
        result: doctor,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 400, {
        ok: false,
        error: message,
      });
      return;
    }
  }

  sendJson(response, 404, {
    ok: false,
    error: "not found",
  });
});

const port = readPort();
server.listen(port, "0.0.0.0", () => {
  // Keep startup output concise for Cloud Run logs.
  // eslint-disable-next-line no-console
  console.info(`[ogx-api] listening on 0.0.0.0:${port}`);
});
