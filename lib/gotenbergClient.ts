/**
 * lib/gotenbergClient.ts
 * ---------------------------------------------------------------------------
 * Shared Gotenberg client with actionable diagnostics for HTML->PDF rendering.
 * ---------------------------------------------------------------------------
 */

export interface GotenbergExtraFile {
  filename: string;
  buffer: Buffer;
  mimeType: string;
}

export type GotenbergFailureType =
  | 'connection_refused'
  | 'timeout'
  | 'dns_resolution_failed'
  | 'service_unreachable'
  | 'network_restricted'
  | 'http_error'
  | 'malformed_request'
  | 'empty_pdf_response'
  | 'unknown';

export interface GotenbergFailure {
  type: GotenbergFailureType;
  endpoint: string;
  method: 'POST';
  message: string;
  causeCode: string | null;
  statusCode: number | null;
  responseSnippet: string | null;
}

export interface RenderHtmlWithGotenbergInput {
  html: string;
  settings: Record<string, string>;
  logPrefix: string;
  label: string;
  extraFiles?: GotenbergExtraFile[];
  timeoutMs?: number;
}

export interface RenderHtmlWithGotenbergResult {
  ok: boolean;
  endpointUsed: string | null;
  buffer: Buffer | null;
  failure: GotenbergFailure | null;
}

const GOTENBERG_ENDPOINT_PATH = '/forms/chromium/convert/html';
const DEFAULT_GOTENBERG_TIMEOUT_MS = 45_000;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function normalizeEndpoint(urlRaw: string): string {
  const candidate = urlRaw.trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = GOTENBERG_ENDPOINT_PATH;
    }
    return parsed.toString();
  } catch {
    return candidate;
  }
}

export function resolveGotenbergEndpointCandidates(): string[] {
  const configured = process.env.GOTENBERG_URL?.trim();
  if (configured) {
    return [normalizeEndpoint(configured)];
  }

  return [
    `http://127.0.0.1:3001${GOTENBERG_ENDPOINT_PATH}`,
    `http://localhost:3001${GOTENBERG_ENDPOINT_PATH}`,
    `http://gotenberg:3000${GOTENBERG_ENDPOINT_PATH}`,
  ];
}

function classifyFetchFailure(err: unknown): {
  type: GotenbergFailureType;
  message: string;
  causeCode: string | null;
} {
  const error = err as { name?: string; message?: string; cause?: { code?: string; message?: string } } | undefined;
  const name = error?.name ?? 'Error';
  const message = error?.message ?? String(err);
  const causeCodeRaw = error?.cause?.code ?? error?.cause?.message ?? null;
  const causeCode = causeCodeRaw ? String(causeCodeRaw) : null;

  if (name === 'AbortError' || causeCode === 'ABORT_ERR') {
    return { type: 'timeout', message, causeCode };
  }
  if (causeCode === 'ECONNREFUSED') {
    return { type: 'connection_refused', message, causeCode };
  }
  if (causeCode === 'ENOTFOUND') {
    return { type: 'dns_resolution_failed', message, causeCode };
  }
  if (causeCode === 'EHOSTUNREACH' || causeCode === 'ENETUNREACH') {
    return { type: 'service_unreachable', message, causeCode };
  }
  if (
    causeCode === 'EPERM' ||
    causeCode === 'EACCES' ||
    causeCode === 'ERR_ACCESS_DENIED'
  ) {
    return { type: 'network_restricted', message, causeCode };
  }
  if (
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    causeCode === 'UND_ERR_HEADERS_TIMEOUT'
  ) {
    return { type: 'timeout', message, causeCode };
  }
  return { type: 'unknown', message, causeCode };
}

function buildHttpFailure(
  endpoint: string,
  statusCode: number,
  responseText: string,
): GotenbergFailure {
  const lowered = responseText.toLowerCase();
  const malformedRequestSignals =
    statusCode === 400 ||
    statusCode === 415 ||
    lowered.includes('multipart') ||
    lowered.includes('content-type') ||
    lowered.includes('invalid form');

  return {
    type: malformedRequestSignals ? 'malformed_request' : 'http_error',
    endpoint,
    method: 'POST',
    message: `Gotenberg responded with HTTP ${statusCode}`,
    causeCode: null,
    statusCode,
    responseSnippet: truncate(responseText, 500),
  };
}

export async function renderHtmlWithGotenberg(
  input: RenderHtmlWithGotenbergInput,
): Promise<RenderHtmlWithGotenbergResult> {
  const endpoints = resolveGotenbergEndpointCandidates();
  const timeoutMsRaw = input.timeoutMs ?? Number(process.env.GOTENBERG_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(timeoutMsRaw, 180_000)
      : DEFAULT_GOTENBERG_TIMEOUT_MS;

  console.log(
    `${input.logPrefix} — Gotenberg request setup (${input.label}): ` +
      `method=POST candidates=[${endpoints.join(', ')}] html_bytes=${Buffer.byteLength(input.html, 'utf8')} ` +
      `extra_files=${input.extraFiles?.length ?? 0} timeout_ms=${timeoutMs} settings=${JSON.stringify(input.settings)}`,
  );

  let lastFailure: GotenbergFailure | null = null;
  for (const endpoint of endpoints) {
    const formData = new FormData();
    formData.append('files', new Blob([input.html], { type: 'text/html' }), 'index.html');
    for (const file of input.extraFiles ?? []) {
      formData.append(
        'files',
        new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
        file.filename,
      );
    }
    for (const [k, v] of Object.entries(input.settings)) {
      formData.append(k, v);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log(`${input.logPrefix} — Gotenberg request attempt (${input.label}): endpoint=${endpoint}`);
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          Accept: 'application/pdf',
        },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        const failure = buildHttpFailure(endpoint, res.status, errText);
        lastFailure = failure;
        console.error(
          `${input.logPrefix} — Gotenberg HTTP failure (${input.label}): ` +
            `${JSON.stringify(failure)}`,
        );
        if (res.status === 404 || res.status === 405) {
          continue;
        }
        return { ok: false, endpointUsed: endpoint, buffer: null, failure };
      }

      const pdfBuffer = Buffer.from(await res.arrayBuffer());
      if (pdfBuffer.length === 0) {
        const failure: GotenbergFailure = {
          type: 'empty_pdf_response',
          endpoint,
          method: 'POST',
          message: 'Gotenberg returned an empty PDF response',
          causeCode: null,
          statusCode: res.status,
          responseSnippet: null,
        };
        lastFailure = failure;
        console.error(
          `${input.logPrefix} — Gotenberg empty response (${input.label}): ` +
            `${JSON.stringify(failure)}`,
        );
        return { ok: false, endpointUsed: endpoint, buffer: null, failure };
      }

      return {
        ok: true,
        endpointUsed: endpoint,
        buffer: pdfBuffer,
        failure: null,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const classified = classifyFetchFailure(err);
      const failure: GotenbergFailure = {
        type: classified.type,
        endpoint,
        method: 'POST',
        message: classified.message,
        causeCode: classified.causeCode,
        statusCode: null,
        responseSnippet: null,
      };
      lastFailure = failure;
      console.error(
        `${input.logPrefix} — Gotenberg transport failure (${input.label}): ` +
          `${JSON.stringify(failure)}`,
      );
      continue;
    }
  }

  return {
    ok: false,
    endpointUsed: lastFailure?.endpoint ?? endpoints[0] ?? null,
    buffer: null,
    failure:
      lastFailure ??
      {
        type: 'unknown',
        endpoint: endpoints[0] ?? 'unknown',
        method: 'POST',
        message: 'No Gotenberg endpoint candidates available',
        causeCode: null,
        statusCode: null,
        responseSnippet: null,
      },
  };
}
