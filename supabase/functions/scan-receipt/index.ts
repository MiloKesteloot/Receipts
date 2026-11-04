// Supabase Edge Function: sends a receipt photo to Azure Document Intelligence
// (prebuilt-receipt) and returns the parsed fields as plain JSON.
//
// Body: { "base64": "<jpeg as base64>" }
// Secrets: AZURE_DI_ENDPOINT, AZURE_DI_KEY

const API_VERSION = "2024-11-30";
const POLL_MS = 1000;
const MAX_POLLS = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
type Field = any;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const amount = (f: Field): number | null =>
  f?.valueCurrency?.amount ?? f?.valueNumber ?? null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const endpoint = Deno.env.get("AZURE_DI_ENDPOINT")?.replace(/\/+$/, "");
  const key = Deno.env.get("AZURE_DI_KEY");
  if (!endpoint || !key) return json({ error: "Azure secrets are not set" }, 500);

  let base64: string | undefined;
  try {
    ({ base64 } = await req.json());
  } catch {
    // fall through to the check below
  }
  if (!base64) return json({ error: "Missing base64 image" }, 400);

  const start = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=${API_VERSION}`,
    {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ base64Source: base64 }),
    },
  );
  if (start.status !== 202) {
    return json({ error: `Azure rejected the image (${start.status})`, detail: await start.text() }, 502);
  }

  // Analysis is async: poll the Operation-Location until it finishes.
  const opUrl = start.headers.get("operation-location")!;
  // deno-lint-ignore no-explicit-any
  let result: any;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(opUrl, { headers: { "Ocp-Apim-Subscription-Key": key } });
    result = await res.json();
    if (result.status === "succeeded" || result.status === "failed") break;
  }
  if (result?.status !== "succeeded") {
    return json({ error: `Azure analysis ${result?.status ?? "timed out"}`, detail: result?.error }, 502);
  }

  const fields = result.analyzeResult?.documents?.[0]?.fields ?? {};
  const items = (fields.Items?.valueArray ?? []).map((it: Field) => {
    const o = it.valueObject ?? {};
    return {
      description: o.Description?.valueString ?? o.Description?.content ?? "(no description)",
      quantity: o.Quantity?.valueNumber ?? null,
      price: amount(o.Price),
      totalPrice: amount(o.TotalPrice),
    };
  });

  return json({
    merchant: fields.MerchantName?.valueString ?? null,
    date: fields.TransactionDate?.valueDate ?? null,
    currency: fields.Total?.valueCurrency?.currencyCode ?? null,
    items,
    subtotal: amount(fields.Subtotal),
    tax: amount(fields.TotalTax),
    tip: amount(fields.Tip),
    total: amount(fields.Total),
    confidence: result.analyzeResult?.documents?.[0]?.confidence ?? null,
  });
});
