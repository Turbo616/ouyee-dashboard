const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const ROOT = process.cwd();
const KEY_FILE = process.env.GA4_KEY_FILE || path.join(ROOT, "secrets", "ga4-service-account.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function readCredentials() {
  if (!fs.existsSync(KEY_FILE)) {
    throw new Error(`未找到服务账号密钥: ${KEY_FILE}`);
  }
  const raw = fs.readFileSync(KEY_FILE, "utf8");
  return JSON.parse(raw);
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(scope) {
  const creds = readCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: creds.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const sig = signer
    .sign(creds.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const assertion = `${unsigned}.${sig}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json?.error_description || json?.error || "获取 access token 失败");
  return json.access_token;
}

async function googleApiRequest({ method = "GET", url, token, body }) {
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await resp.text();
  const json = text ? JSON.parse(text) : {};
  if (!resp.ok) {
    const err = new Error(json?.error?.message || `Google API 请求失败: ${resp.status}`);
    err.status = resp.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function normalizeDate(yyyymmdd) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function buildMap(rows, dimKey, metricIdx = 0) {
  const map = {};
  (rows || []).forEach((row) => {
    const key = row.dimensionValues?.[dimKey]?.value || row.dimensionValues?.[0]?.value;
    map[key] = num(row.metricValues?.[metricIdx]?.value);
  });
  return map;
}

function simplifyApiError(err) {
  const payload = err.payload || {};
  const error = payload.error || {};
  const details = error.details || [];
  const errorInfo = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.ErrorInfo");
  const help = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.Help");
  const localized = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.LocalizedMessage");
  return {
    status: err.status || 500,
    message: error.message || err.message,
    reason: errorInfo?.reason || null,
    service: errorInfo?.metadata?.service || null,
    activationUrl: errorInfo?.metadata?.activationUrl || help?.links?.[0]?.url || null,
    localizedMessage: localized?.message || null
  };
}

async function runReport(token, propertyId, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  return googleApiRequest({ method: "POST", url, token, body });
}

async function buildDashboard(propertyId, startDate, endDate) {
  const token = await getAccessToken("https://www.googleapis.com/auth/analytics.readonly");

  const dateRanges = [{ startDate, endDate }];
  let daily;
  let page;

  try {
    daily = await runReport(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "keyEvents" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "totalRevenue" }
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      keepEmptyRows: true,
      limit: 1000
    });

    page = await runReport(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12
    });
  } catch (err) {
    if (!String(err.message || "").includes("keyEvents")) throw err;
    daily = await runReport(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "conversions" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "totalRevenue" }
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      keepEmptyRows: true,
      limit: 1000
    });
    page = await runReport(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12
    });
  }

  const [channel, device] = await Promise.all([
    runReport(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20
    }),
    runReport(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10
    })
  ]);

  const perDay = (daily.rows || []).map((row) => ({
    date: normalizeDate(row.dimensionValues?.[0]?.value),
    sessions: num(row.metricValues?.[0]?.value),
    users: num(row.metricValues?.[1]?.value),
    pageviews: num(row.metricValues?.[2]?.value),
    conversions: num(row.metricValues?.[3]?.value),
    bounceRate: num(row.metricValues?.[4]?.value),
    avgDuration: num(row.metricValues?.[5]?.value),
    revenue: num(row.metricValues?.[6]?.value)
  }));

  const channels = buildMap(channel.rows || [], 0, 0);
  const devices = buildMap(device.rows || [], 0, 0);
  const topPages = (page.rows || []).map((row) => ({
    path: row.dimensionValues?.[0]?.value || "(not set)",
    sessions: num(row.metricValues?.[0]?.value),
    conversions: num(row.metricValues?.[1]?.value)
  }));

  return { perDay, channels, devices, topPages };
}

async function discoverProperties() {
  const token = await getAccessToken("https://www.googleapis.com/auth/analytics.readonly");
  const json = await googleApiRequest({
    url: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    token
  });
  const properties = [];
  (json.accountSummaries || []).forEach((acc) => {
    (acc.propertySummaries || []).forEach((p) => {
      properties.push({
        account: acc.displayName,
        accountName: acc.name,
        propertyName: p.displayName,
        property: p.property,
        propertyId: String(p.property || "").split("/").pop()
      });
    });
  });
  return properties;
}

async function tryEnableGaApis() {
  const creds = readCredentials();
  const token = await getAccessToken("https://www.googleapis.com/auth/cloud-platform");
  const services = ["analyticsadmin.googleapis.com", "analyticsdata.googleapis.com"];
  const result = [];

  for (const svc of services) {
    const url = `https://serviceusage.googleapis.com/v1/projects/${creds.project_id}/services/${svc}:enable`;
    try {
      const out = await googleApiRequest({ method: "POST", url, token });
      result.push({ service: svc, ok: true, operation: out.name || null });
    } catch (err) {
      result.push({ service: svc, ok: false, error: simplifyApiError(err) });
    }
  }

  return { projectId: creds.project_id, projectNumber: "763126982723", result };
}

function sendJson(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, clean));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname === "/api/health") {
    try {
      const creds = readCredentials();
      return sendJson(res, 200, { ok: true, keyFile: KEY_FILE, clientEmail: creds.client_email, projectId: creds.project_id });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === "/api/ga4/enable-services" && req.method === "POST") {
    try {
      const data = await tryEnableGaApis();
      return sendJson(res, 200, data);
    } catch (err) {
      const simple = simplifyApiError(err);
      return sendJson(res, simple.status || 500, { error: simple.message, details: simple });
    }
  }

  if (pathname === "/api/ga4/discover") {
    try {
      const properties = await discoverProperties();
      return sendJson(res, 200, { properties });
    } catch (err) {
      const simple = simplifyApiError(err);
      return sendJson(res, simple.status || 500, { error: simple.message, details: simple });
    }
  }

  if (pathname === "/api/ga4/dashboard") {
    const propertyId = (parsed.searchParams.get("propertyId") || "").trim();
    const startDate = (parsed.searchParams.get("startDate") || "").trim();
    const endDate = (parsed.searchParams.get("endDate") || "").trim();
    if (!/^\d+$/.test(propertyId)) {
      return sendJson(res, 400, { error: "propertyId 无效，必须是纯数字" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return sendJson(res, 400, { error: "startDate/endDate 必须是 YYYY-MM-DD" });
    }
    try {
      const dashboard = await buildDashboard(propertyId, startDate, endDate);
      return sendJson(res, 200, dashboard);
    } catch (err) {
      const simple = simplifyApiError(err);
      return sendJson(res, simple.status || 500, { error: simple.message, details: simple });
    }
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Dashboard server running: http://localhost:${PORT}`);
  console.log(`GA4 key file: ${KEY_FILE}`);
});
