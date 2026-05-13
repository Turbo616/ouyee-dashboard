import { getAccessToken, googleApiRequest, json, simplifyApiError } from "../../_lib/ga4.js";

const DATE_KEYS = ["日期", "date", "created_at", "createdAt"];
const URL_KEYS = ["询盘来源URL", "来源URL", "url", "source_url", "landing_url"];
const SITE_KEYS = ["网站", "站点", "domain", "site"];

function pickHeaderIndex(headers, candidates) {
  const lower = headers.map((h) => String(h || "").trim().toLowerCase());
  for (const key of candidates) {
    const idx = lower.indexOf(String(key).trim().toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseDateToIso(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m1) {
    const [, y, mo, d] = m1;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const m2 = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m2) {
    const [, y, mo, d] = m2;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function mapSiteId(urlValue, siteValue) {
  const t = `${urlValue || ""} ${siteValue || ""}`.toLowerCase();
  if (t.includes("ouyedisplay.com")) return "ouyedisplay";
  if (t.includes("oydisplay.com")) return "oydisplay";
  return null;
}

function addDaily(bucket, siteId, date) {
  if (!bucket[siteId]) {
    bucket[siteId] = { total: 0, daily: {} };
  }
  bucket[siteId].total += 1;
  bucket[siteId].daily[date] = (bucket[siteId].daily[date] || 0) + 1;
}

export const onRequestGet = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);

  const spreadsheetId = url.searchParams.get("spreadsheetId") || env.LEADS_SPREADSHEET_ID || "";
  const range = url.searchParams.get("range") || env.LEADS_RANGE || "Sheet1!A:Z";

  if (!spreadsheetId) {
    return json({ error: "Missing LEADS_SPREADSHEET_ID (or query spreadsheetId)" }, 400);
  }

  try {
    const token = await getAccessToken(env, "https://www.googleapis.com/auth/spreadsheets.readonly");
    const encodedRange = encodeURIComponent(range);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?majorDimension=ROWS`;
    const payload = await googleApiRequest({ url: apiUrl, token });
    const values = payload.values || [];

    if (!values.length) {
      return json({
        spreadsheetId,
        range,
        rowCount: 0,
        perSite: {
          oydisplay: { total: 0, daily: {} },
          ouyedisplay: { total: 0, daily: {} }
        }
      });
    }

    const headers = values[0];
    const dateIdx = pickHeaderIndex(headers, DATE_KEYS);
    const urlIdx = pickHeaderIndex(headers, URL_KEYS);
    const siteIdx = pickHeaderIndex(headers, SITE_KEYS);

    if (dateIdx < 0) {
      return json({ error: "Cannot find date column. Expected one of: 日期/date/created_at" }, 400);
    }

    const perSite = {
      oydisplay: { total: 0, daily: {} },
      ouyedisplay: { total: 0, daily: {} }
    };

    let parsedRows = 0;
    let skippedRows = 0;

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      const rawDate = row[dateIdx];
      const day = parseDateToIso(rawDate);
      if (!day) {
        skippedRows += 1;
        continue;
      }
      const sourceUrl = urlIdx >= 0 ? row[urlIdx] : "";
      const siteHint = siteIdx >= 0 ? row[siteIdx] : "";
      const siteId = mapSiteId(sourceUrl, siteHint);
      if (!siteId) {
        skippedRows += 1;
        continue;
      }
      addDaily(perSite, siteId, day);
      parsedRows += 1;
    }

    return json({
      spreadsheetId,
      range,
      rowCount: values.length - 1,
      parsedRows,
      skippedRows,
      perSite
    });
  } catch (err) {
    const details = simplifyApiError(err);
    return json({ error: details.message, details }, details.status || 500);
  }
};
