const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const url = option("--url") || process.env.SUBMISSION_API_URL;
const submissionId = option("--submission-id") || crypto.randomUUID();
const salesCode = option("--sales-code") || "APRIL";

if (!url) {
  console.error("錯誤：請使用 --url 指定 /api/submissions 網址。");
  process.exit(1);
}

const payload = {
  submissionId,
  partner1Name: "BACKEND_TEST_A",
  partner1Phone: "0900000001",
  partner2Name: "BACKEND_TEST_B",
  partner2Phone: "0900000002",
  emergencyContactName: "BACKEND_TEST_CONTACT",
  emergencyContactPhone: "0900000003",
  weddingDate: "2027-01-01",
  dateUndecided: false,
  banquetSession: "午宴",
  estimatedTables: 20,
  salesCode,
};

try {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35000),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { error: "回傳內容不是有效 JSON。" }; }
  console.log(JSON.stringify({
    httpStatus: response.status,
    success: Boolean(body.success),
    status: body.status ?? null,
    serialNumber: body.serialNumber ?? null,
    salesName: body.salesName ?? null,
    error: body.error ?? null,
  }, null, 2));
  if (!response.ok || !body.success) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    httpStatus: null,
    success: false,
    status: "ERROR",
    serialNumber: null,
    salesName: null,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
