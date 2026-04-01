import { describe, it, expect } from "vitest";
import { gzipSync } from "zlib";
import { extractXmlFromEmail, parseDmarcXml } from "./dmarc";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_XML = `
<feedback>
  <report_metadata>
    <org_name>Google</org_name>
    <report_id>rpt-001</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain>
    <adkim>r</adkim><aspf>r</aspf><p>none</p>
  </policy_published>
  <record>
    <row>
      <source_ip>1.2.3.4</source_ip>
      <count>10</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>example.com</header_from>
      <envelope_from>example.com</envelope_from>
    </identifiers>
    <auth_results>
      <dkim><domain>example.com</domain><selector>s1</selector><result>pass</result></dkim>
      <spf><domain>example.com</domain><result>pass</result></spf>
    </auth_results>
  </record>
</feedback>`;

const FAIL_XML = `
<feedback>
  <report_metadata>
    <org_name>Microsoft</org_name>
    <report_id>rpt-002</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain><p>reject</p></policy_published>
  <record>
    <row>
      <source_ip>9.9.9.9</source_ip>
      <count>5</count>
      <policy_evaluated>
        <disposition>reject</disposition>
        <dkim>fail</dkim>
        <spf>fail</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>phish.example.com</header_from>
      <envelope_from>phish.example.com</envelope_from>
    </identifiers>
    <auth_results>
      <dkim><domain>phish.example.com</domain><result>fail</result></dkim>
      <spf><domain>phish.example.com</domain><result>fail</result></spf>
    </auth_results>
  </record>
</feedback>`;

// DMARC OR semantics: spf alignment passes even though dkim alignment fails
const PARTIAL_PASS_XML = `
<feedback>
  <report_metadata>
    <org_name>Yahoo</org_name>
    <report_id>rpt-003</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain><p>none</p></policy_published>
  <record>
    <row>
      <source_ip>5.5.5.5</source_ip>
      <count>3</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>fail</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>example.com</header_from>
      <envelope_from>example.com</envelope_from>
    </identifiers>
    <auth_results>
      <dkim><domain>example.com</domain><result>fail</result></dkim>
      <spf><domain>example.com</domain><result>pass</result></spf>
    </auth_results>
  </record>
</feedback>`;

// ─── extractXmlFromEmail ──────────────────────────────────────────────────────

describe("extractXmlFromEmail", () => {
  it("returns null for a plain text email with no XML", () => {
    expect(extractXmlFromEmail("Hello world")).toBeNull();
  });

  it("extracts inline XML when the feedback block appears in the body", () => {
    const email = `MIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\n${FULL_XML}`;
    const xml = extractXmlFromEmail(email);
    expect(xml).toContain("<feedback>");
    expect(xml).toContain("</feedback>");
  });

  it("extracts XML from a base64-encoded text/xml MIME attachment", () => {
    const b64 = Buffer.from(FULL_XML).toString("base64");
    const email = [
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="boundary42"',
      "",
      "--boundary42",
      "Content-Type: text/xml",
      "Content-Transfer-Encoding: base64",
      "",
      b64,
      "--boundary42--",
    ].join("\r\n");

    const xml = extractXmlFromEmail(email);
    expect(xml).toContain("<feedback>");
  });

  it("extracts XML from a base64-encoded application/gzip MIME attachment", () => {
    const gzipped = gzipSync(Buffer.from(FULL_XML));
    const b64 = gzipped.toString("base64");
    const email = [
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="gz-boundary"',
      "",
      "--gz-boundary",
      'Content-Type: application/gzip; name="report.xml.gz"',
      "Content-Transfer-Encoding: base64",
      "",
      b64,
      "--gz-boundary--",
    ].join("\r\n");

    const xml = extractXmlFromEmail(email);
    expect(xml).toContain("<feedback>");
  });

  it("skips MIME parts that are not XML or gzip", () => {
    const email = [
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="bnd"',
      "",
      "--bnd",
      "Content-Type: text/plain",
      "",
      "nothing here",
      "--bnd--",
    ].join("\r\n");

    expect(extractXmlFromEmail(email)).toBeNull();
  });
});

// ─── parseDmarcXml ────────────────────────────────────────────────────────────

describe("parseDmarcXml", () => {
  it("returns null for empty or non-feedback XML", async () => {
    expect(await parseDmarcXml("<root/>")).toBeNull();
    expect(await parseDmarcXml("not xml at all")).toBeNull();
  });

  it("returns feedback and analysis for valid XML", async () => {
    const result = await parseDmarcXml(FULL_XML);
    expect(result).not.toBeNull();
    expect(result!.feedback).toBeDefined();
    expect(result!.analysis).toBeDefined();
  });

  // ── Pass / fail counting ───────────────────────────────────────────────────

  it("counts a record as pass when both dkim and spf alignment pass", async () => {
    const { analysis } = (await parseDmarcXml(FULL_XML))!;
    expect(analysis.passCount).toBe(10);
    expect(analysis.failCount).toBe(0);
  });

  it("counts a record as fail when both alignments fail", async () => {
    const { analysis } = (await parseDmarcXml(FAIL_XML))!;
    expect(analysis.passCount).toBe(0);
    expect(analysis.failCount).toBe(5);
  });

  it("counts a record as pass when only spf alignment passes (DMARC OR semantics)", async () => {
    const { analysis } = (await parseDmarcXml(PARTIAL_PASS_XML))!;
    expect(analysis.passCount).toBe(3);
    expect(analysis.failCount).toBe(0);
  });

  // ── Disposition bucketing ─────────────────────────────────────────────────

  it("buckets message counts by disposition", async () => {
    const { analysis } = (await parseDmarcXml(FULL_XML))!;
    expect(analysis.dispositions).toEqual({ none: 10 });
  });

  it("records reject disposition for failing messages", async () => {
    const { analysis } = (await parseDmarcXml(FAIL_XML))!;
    expect(analysis.dispositions).toEqual({ reject: 5 });
  });

  // ── Source record extraction ───────────────────────────────────────────────

  it("extracts source IP from the record", async () => {
    const { analysis } = (await parseDmarcXml(FULL_XML))!;
    expect(analysis.sourceRecords).toHaveLength(1);
    expect(analysis.sourceRecords[0].sourceIp).toBe("1.2.3.4");
  });

  it("extracts header_from and envelope_from identifiers", async () => {
    const { analysis } = (await parseDmarcXml(FULL_XML))!;
    const rec = analysis.sourceRecords[0];
    expect(rec.headerFrom).toBe("example.com");
    expect(rec.envelopeFrom).toBe("example.com");
  });

  it("captures dkim and spf alignment and auth results per record", async () => {
    const { analysis } = (await parseDmarcXml(FULL_XML))!;
    const rec = analysis.sourceRecords[0];
    expect(rec.dkimAlignment).toBe("pass");
    expect(rec.spfAlignment).toBe("pass");
    expect(rec.dkimAuthResult).toBe("pass");
    expect(rec.spfAuthResult).toBe("pass");
  });

  it("captures failure details in the source record", async () => {
    const { analysis } = (await parseDmarcXml(FAIL_XML))!;
    const rec = analysis.sourceRecords[0];
    expect(rec.sourceIp).toBe("9.9.9.9");
    expect(rec.disposition).toBe("reject");
    expect(rec.dkimAlignment).toBe("fail");
    expect(rec.spfAlignment).toBe("fail");
  });

  // ── Multiple records ───────────────────────────────────────────────────────

  it("handles multiple records and sums pass/fail counts correctly", async () => {
    const xml = `
<feedback>
  <report_metadata>
    <org_name>Multi</org_name><report_id>multi-1</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain><p>none</p></policy_published>
  <record>
    <row>
      <source_ip>1.1.1.1</source_ip><count>8</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from><envelope_from>example.com</envelope_from></identifiers>
    <auth_results>
      <dkim><result>pass</result></dkim><spf><result>pass</result></spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>2.2.2.2</source_ip><count>3</count>
      <policy_evaluated><disposition>quarantine</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>bad.example.com</header_from><envelope_from>bad.example.com</envelope_from></identifiers>
    <auth_results>
      <dkim><result>fail</result></dkim><spf><result>fail</result></spf>
    </auth_results>
  </record>
</feedback>`;

    const { analysis } = (await parseDmarcXml(xml))!;
    expect(analysis.passCount).toBe(8);
    expect(analysis.failCount).toBe(3);
    expect(analysis.sourceRecords).toHaveLength(2);
    expect(analysis.dispositions).toEqual({ none: 8, quarantine: 3 });
  });
});
