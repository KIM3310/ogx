import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const OPERATOR_TOKEN_HEADER = "x-operator-token";

function readExpectedToken(): string {
  return (process.env.OGX_OPERATOR_TOKEN || "").trim();
}

function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readPresentedToken(request: IncomingMessage): string {
  const headerToken = request.headers[OPERATOR_TOKEN_HEADER];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim();
  }

  return "";
}

export function operatorAuthEnabled(): boolean {
  return readExpectedToken().length > 0;
}

export function readOperatorAuthStatus() {
  return {
    enabled: operatorAuthEnabled(),
    header: OPERATOR_TOKEN_HEADER,
    bearer_supported: true,
  };
}

export function authorizeOperatorRequest(request: IncomingMessage): boolean {
  const expected = readExpectedToken();
  if (!expected) {
    return true;
  }

  const presented = readPresentedToken(request);
  if (!presented) {
    return false;
  }

  return tokensMatch(presented, expected);
}
