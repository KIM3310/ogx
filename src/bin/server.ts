import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createProgram } from "../cli/program.js";
import { runCommand } from "../utils/process.js";

interface JsonObject {
  [key: string]: unknown;
}

const MAX_BODY_BYTES = 512 * 1024;

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
      version: "0.1.0",
    });
    return;
  }

  if (method === "GET" && url === "/") {
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

