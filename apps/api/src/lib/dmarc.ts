import { gunzipSync } from "zlib";
import xml2js from "xml2js";

// ─── MIME extraction ──────────────────────────────────────────────────────────

/**
 * Extracts the DMARC aggregate XML payload from a raw MIME email.
 *
 * Handles three common delivery forms:
 *   1. Inline XML in the email body (fast path)
 *   2. MIME multipart with a plain XML attachment
 *   3. MIME multipart with a gzip-compressed XML attachment (base64-encoded)
 *
 * ZIP attachments are not yet supported and require an additional dependency
 * (e.g. adm-zip). Reporters that send .zip archives will fall through to null.
 */
export function extractXmlFromEmail(rawEmail: string): string | null {
  // 1. Fast path — XML is inline (e.g. forwarded without MIME wrapping)
  const inlineMatch = rawEmail.match(/<feedback[\s\S]*?<\/feedback>/);
  if (inlineMatch) return inlineMatch[0];

  // 2. MIME multipart — locate the boundary
  const boundaryMatch =
    rawEmail.match(/boundary="([^"]+)"/i) ??
    rawEmail.match(/boundary=([^\s;]+)/i);
  if (!boundaryMatch) return null;

  const boundary = boundaryMatch[1];
  const parts = rawEmail.split(`--${boundary}`);

  for (const part of parts) {
    // Split headers from body (handles both CRLF and LF line endings)
    const crlfIdx = part.indexOf("\r\n\r\n");
    const lfIdx = part.indexOf("\n\n");
    const splitIdx =
      crlfIdx !== -1 ? crlfIdx + 4 : lfIdx !== -1 ? lfIdx + 2 : -1;
    if (splitIdx === -1) continue;

    const headers = part.slice(0, splitIdx).toLowerCase();
    const body = part.slice(splitIdx).trim();

    const isXml =
      headers.includes("application/xml") ||
      headers.includes("text/xml") ||
      headers.includes(".xml\"") ||
      headers.includes(".xml;");
    const isGzip =
      headers.includes("application/gzip") ||
      headers.includes("application/x-gzip") ||
      headers.includes(".xml.gz") ||
      (headers.includes(".gz") && !headers.includes(".zip"));

    if (!isXml && !isGzip) continue;

    const isBase64 = headers.includes("base64");
    let content: Buffer = isBase64
      ? Buffer.from(body.replace(/\s/g, ""), "base64")
      : Buffer.from(body, "utf-8");

    if (isGzip) {
      try {
        content = gunzipSync(content);
      } catch {
        continue;
      }
    }

    const xml = content.toString("utf-8");
    if (xml.includes("<feedback>")) return xml;
  }

  return null;
}

// ─── XML analysis ─────────────────────────────────────────────────────────────

export interface DmarcSourceRecord {
  /** Sending IP address as reported by the receiving MTA. */
  sourceIp: string;
  /** Number of messages from this IP in the report period. */
  count: number;
  /** Disposition applied by the receiver: none | quarantine | reject. */
  disposition: string;
  /**
   * DKIM alignment result from policy_evaluated (authoritative DMARC result).
   * Falls back to the raw auth_results dkim result when policy_evaluated is absent.
   */
  dkimAlignment: string;
  /** SPF alignment result — same semantics as dkimAlignment. */
  spfAlignment: string;
  /** Whether the DKIM signature itself validated (independent of alignment). */
  dkimAuthResult: string;
  /** Whether the SPF check passed (independent of alignment). */
  spfAuthResult: string;
  /** RFC5322 From domain. */
  headerFrom: string;
  /** MAIL FROM / envelope sender domain. */
  envelopeFrom: string;
}

export interface DmarcAnalysis {
  passCount: number;
  failCount: number;
  /** Message counts bucketed by receiver disposition. */
  dispositions: Record<string, number>;
  /** Per-source-IP breakdown for forensic investigation. */
  sourceRecords: DmarcSourceRecord[];
}

function coerceArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Parses a DMARC aggregate (RUA) XML string.
 *
 * Pass/fail determination:
 *   - If `row.policy_evaluated` is present, uses alignment results and applies
 *     the correct DMARC semantics: a message passes if EITHER dkim OR spf
 *     alignment passes.
 *   - If `policy_evaluated` is absent (e.g. simplified test fixtures), falls
 *     back to checking auth_results directly with a both-must-pass rule.
 *
 * Returns null if the XML is missing or malformed.
 */
export async function parseDmarcXml(xml: string): Promise<{
  feedback: Record<string, unknown>;
  analysis: DmarcAnalysis;
} | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  } catch {
    return null;
  }

  const feedback = parsed?.feedback as Record<string, unknown> | undefined;
  if (!feedback) return null;

  const records = coerceArray(feedback.record as unknown);

  let passCount = 0;
  let failCount = 0;
  const dispositions: Record<string, number> = {};
  const sourceRecords: DmarcSourceRecord[] = [];

  for (const record of records) {
    const count = parseInt((record as any)?.row?.count ?? "1", 10);
    const evaluated = (record as any)?.row?.policy_evaluated ?? {};
    const authResults = (record as any)?.auth_results ?? {};

    // Alignment results from policy_evaluated (authoritative)
    const dkimAlignmentEval: string = evaluated.dkim ?? "";
    const spfAlignmentEval: string = evaluated.spf ?? "";

    // Underlying mechanism results from auth_results
    const dkimEntries = coerceArray(authResults.dkim);
    const spfEntries = coerceArray(authResults.spf);
    const dkimAuthResult: string = (dkimEntries[0] as any)?.result ?? "none";
    const spfAuthResult: string = (spfEntries[0] as any)?.result ?? "none";

    // DMARC pass determination
    let dmarcPass: boolean;
    if (dkimAlignmentEval || spfAlignmentEval) {
      // policy_evaluated present: proper DMARC OR semantics
      dmarcPass = dkimAlignmentEval === "pass" || spfAlignmentEval === "pass";
    } else {
      // Fallback: require both auth mechanisms to pass
      dmarcPass = dkimAuthResult === "pass" && spfAuthResult === "pass";
    }

    if (dmarcPass) passCount += count;
    else failCount += count;

    const disposition: string = evaluated.disposition ?? "none";
    dispositions[disposition] = (dispositions[disposition] ?? 0) + count;

    sourceRecords.push({
      sourceIp: (record as any)?.row?.source_ip ?? "unknown",
      count,
      disposition,
      dkimAlignment: dkimAlignmentEval || dkimAuthResult,
      spfAlignment: spfAlignmentEval || spfAuthResult,
      dkimAuthResult,
      spfAuthResult,
      headerFrom: (record as any)?.identifiers?.header_from ?? "",
      envelopeFrom: (record as any)?.identifiers?.envelope_from ?? "",
    });
  }

  return {
    feedback,
    analysis: { passCount, failCount, dispositions, sourceRecords },
  };
}
