import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const OBSERVABILITY_COOKIE = "tasuki_observability_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function credentials() {
  return {
    username: process.env.TASUKI_ADMIN_USERNAME?.trim() || process.env.OBSERVABILITY_USERNAME?.trim() || "",
    password: process.env.TASUKI_ADMIN_PASSWORD || process.env.OBSERVABILITY_PASSWORD || "",
  };
}

function secret() {
  return process.env.TASUKI_ADMIN_SESSION_SECRET || credentials().password;
}

export function checkCredentials(username: string, password: string) {
  const expected = credentials();
  return Boolean(expected.username && expected.password && username === expected.username && password === expected.password);
}

export function createSessionToken(username: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${username}.${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [username, expiresAt, signature] = parts;
  const expected = createHmac("sha256", secret()).update(`${username}.${expiresAt}`).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return false;
  return Boolean(username && Number(expiresAt) > Math.floor(Date.now() / 1000));
}

export function loginConfigured() {
  const expected = credentials();
  return Boolean(expected.username && expected.password);
}
