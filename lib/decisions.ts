/**
 * Server-side client for Jev, TypeSafe's System One decision model.
 *
 * Jev is reachable through two wire-compatible endpoints, and this client
 * speaks both. They take the same {state, model, questions} body and return the
 * same {answers, model, usage} envelope, so only the URL, the key and the model
 * slug differ:
 *
 *   openrouter  POST https://openrouter.ai/api/alpha/decisions
 *               Authorization: Bearer <OPENROUTER_API_KEY>
 *               model: "typesafe/jev-1.13" | "~typesafe/jev-latest"
 *               docs: https://openrouter.ai/docs/api/api-reference/alphadecisions
 *
 *   typesafe    POST https://api.typesafe.ai/v1/systemone
 *               Authorization: Bearer <TYPESAFE_API_KEY>
 *               model: "jev-latest" | "jev-1.13.0"
 *               docs: https://docs.typesafe.ai/api
 *
 * The provider is picked from whichever key is present, or forced with
 * JEV_PROVIDER. This file is server-only: the key never reaches the browser,
 * every call goes through a Next.js route handler.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Description = string | Record<string, JsonValue> | JsonValue[];

export interface NoulQuestion {
  type: "noul";
  instructions: Description;
  criteria?: Description;
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: Description;
  /** option id -> rubric description (null when the id speaks for itself) */
  criteria: Record<string, Description | null>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: Description;
  /** ordered levels, lowest first */
  criteria: Description[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** OpenRouter only: USD charged for the call. */
    cost?: number;
  };
  /** OpenRouter only. */
  id?: string;
  provider?: string;
}

export class DecisionsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "DecisionsError";
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

export type Provider = "openrouter" | "typesafe";

const PROVIDERS: Record<Provider, { baseUrl: string; path: string; model: string; keyVar: string }> = {
  openrouter: {
    baseUrl: "https://openrouter.ai",
    path: "/api/alpha/decisions",
    model: "typesafe/jev-1.13",
    keyVar: "OPENROUTER_API_KEY",
  },
  typesafe: {
    baseUrl: "https://api.typesafe.ai",
    path: "/v1/systemone",
    model: "jev-latest",
    keyVar: "TYPESAFE_API_KEY",
  },
};

/** Explicit JEV_PROVIDER wins; otherwise whichever key is configured. */
export function resolveProvider(): Provider {
  const forced = process.env.JEV_PROVIDER?.trim().toLowerCase();
  if (forced === "openrouter" || forced === "typesafe") return forced;
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  if (process.env.TYPESAFE_API_KEY?.trim()) return "typesafe";
  return "openrouter";
}

export function apiKey(provider: Provider = resolveProvider()): string | null {
  return process.env[PROVIDERS[provider].keyVar]?.trim() || null;
}

/** The model slug sent in the request, which differs per provider. */
export function jevModel(provider: Provider = resolveProvider()): string {
  return process.env.JEV_MODEL?.trim() || PROVIDERS[provider].model;
}

/** True when Jev can actually be called. When false, the local engine plays. */
export function isConfigured(): boolean {
  return Boolean(apiKey());
}

interface SystemOneOptions {
  /** Hard deadline for the whole call, retries included. */
  timeoutMs?: number;
  /** Total attempts, including the first. */
  attempts?: number;
  signal?: AbortSignal;
}

/**
 * Ask Jev one or more typed questions about a single state.
 *
 * All questions see the same state and are evaluated in parallel by the model,
 * so batching is both cheaper and faster than issuing separate requests.
 */
export async function systemOne(
  state: JsonValue,
  questions: Record<string, Question>,
  options: SystemOneOptions = {},
): Promise<SystemOneResponse> {
  const provider = resolveProvider();
  const config = PROVIDERS[provider];
  const key = apiKey(provider);

  if (!key) {
    throw new DecisionsError(
      `${config.keyVar} is not set. Add it to .env.local to enable Jev.`,
      401,
    );
  }

  const base = (process.env.JEV_BASE_URL?.trim() || config.baseUrl).replace(/\/+$/, "");
  const url = `${base}${config.path}`;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const attempts = Math.max(1, options.attempts ?? 2);
  const deadline = Date.now() + timeoutMs;

  const payload = JSON.stringify({ state, model: jevModel(provider), questions });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (provider === "openrouter") {
    // Optional, and only used for OpenRouter's app leaderboards.
    headers["HTTP-Referer"] = process.env.JEV_APP_URL?.trim() || "https://loopengine.tech";
    headers["X-Title"] = process.env.JEV_APP_NAME?.trim() || "Jev Chess";
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.ok) return (await res.json()) as SystemOneResponse;

      const body = await res.text();
      const error = new DecisionsError(
        `Jev (${provider}) responded ${res.status}: ${body.slice(0, 400)}`,
        res.status,
        body,
      );

      if (!RETRYABLE.has(res.status) || attempt === attempts - 1) throw error;

      lastError = error;
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : 250 * 2 ** attempt;
      const sleep = Math.min(backoff, Math.max(0, deadline - Date.now()));
      if (sleep <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, sleep));
    } catch (error) {
      if (error instanceof DecisionsError) throw error;
      lastError = error;
      // Network failure or abort: retry only if there is budget left.
      if (attempt === attempts - 1 || Date.now() >= deadline) break;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  throw new DecisionsError(
    lastError instanceof Error
      ? `Jev request failed: ${lastError.message}`
      : "Jev request failed.",
  );
}

/** Narrowing helpers -- the API is typed per question id at the call site. */
export function asChoice(answer: Answer | undefined): ChoiceAnswer | null {
  return answer?.type === "choice" ? answer : null;
}

export function asNoul(answer: Answer | undefined): NoulAnswer | null {
  return answer?.type === "noul" ? answer : null;
}

export function asScore(answer: Answer | undefined): ScoreAnswer | null {
  return answer?.type === "score" ? answer : null;
}
