import { getAccessToken, googleApiRequest, json, simplifyApiError } from "../../_lib/ga4.js";

const SITE_MAP = {
  oydisplay: "oydisplay.com",
  ouyedisplay: "ouyedisplay.com",
  focusstoredisplay: "focusstoredisplay.com"
};

function encSiteUrl(siteUrl) {
  return encodeURIComponent(siteUrl);
}

function normalize(v) {
  return String(v || "").toLowerCase();
}

function findBestProperty(siteEntries, domain) {
  const target = normalize(domain);
  const candidates = (siteEntries || []).map((e) => e.siteUrl).filter(Boolean);
  const preferred = [
    `sc-domain:${target}`,
    `https://${target}/`,
    `http://${target}/`,
    `https://www.${target}/`,
    `http://www.${target}/`
  ];
  for (const p of preferred) {
    if (candidates.includes(p)) return p;
  }
  // fallback contains match
  return candidates.find((c) => normalize(c).includes(target)) || null;
}

async function queryGsc(token, siteUrl, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encSiteUrl(siteUrl)}/searchAnalytics/query`;
  return googleApiRequest({ method: "POST", url, token, body });
}

function cleanRows(rows, dimNames) {
  return (rows || []).map((r) => {
    const out = {
      clicks: Number(r.clicks || 0),
      impressions: Number(r.impressions || 0),
      ctr: Number(r.ctr || 0),
      position: Number(r.position || 0)
    };
    (dimNames || []).forEach((d, i) => {
      out[d] = r.keys?.[i] || "";
    });
    return out;
  });
}

export const onRequestGet = async (context) => {
  const { request } = context;
  const u = new URL(request.url);
  const startDate = u.searchParams.get("startDate");
  const endDate = u.searchParams.get("endDate");
  const selectedParam = u.searchParams.get("sites") || "";
  const selected = selectedParam
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => SITE_MAP[x]);

  if (!startDate || !endDate) {
    return json({ error: "startDate and endDate are required (YYYY-MM-DD)" }, 400);
  }

  try {
    const token = await getAccessToken(context.env, "https://www.googleapis.com/auth/webmasters.readonly");
    const sitesPayload = await googleApiRequest({
      url: "https://searchconsole.googleapis.com/webmasters/v3/sites",
      token
    });
    const siteEntries = sitesPayload.siteEntry || [];

    const targetSites = selected.length ? selected : Object.keys(SITE_MAP);
    const perSite = {};

    for (const siteId of targetSites) {
      const domain = SITE_MAP[siteId];
      const siteUrl = findBestProperty(siteEntries, domain);
      if (!siteUrl) {
        perSite[siteId] = { domain, siteUrl: null, error: "No Search Console property access", kpi: {}, topQueries: [], topPages: [] };
        continue;
      }

      const queryBody = {
        startDate,
        endDate,
        rowLimit: 20
      };

      const [kpiRes, qRes, pRes] = await Promise.all([
        queryGsc(token, siteUrl, { ...queryBody, dimensions: ["date"], rowLimit: 1 }),
        queryGsc(token, siteUrl, { ...queryBody, dimensions: ["query"], rowLimit: 20 }),
        queryGsc(token, siteUrl, { ...queryBody, dimensions: ["page"], rowLimit: 20 })
      ]);

      const kpiRows = cleanRows(kpiRes.rows || [], ["date"]);
      const topQueries = cleanRows(qRes.rows || [], ["query"]);
      const topPages = cleanRows(pRes.rows || [], ["page"]);

      let clicks = 0;
      let impressions = 0;
      let ctrWeighted = 0;
      let posWeighted = 0;
      const base = topQueries.length ? topQueries : kpiRows;
      base.forEach((r) => {
        clicks += r.clicks;
        impressions += r.impressions;
        ctrWeighted += r.ctr * r.impressions;
        posWeighted += r.position * r.impressions;
      });
      const ctr = impressions ? ctrWeighted / impressions : 0;
      const position = impressions ? posWeighted / impressions : 0;

      perSite[siteId] = {
        domain,
        siteUrl,
        error: null,
        kpi: { clicks, impressions, ctr, position },
        topQueries,
        topPages
      };
    }

    return json({
      startDate,
      endDate,
      perSite
    });
  } catch (err) {
    const details = simplifyApiError(err);
    return json({ error: details.message, details }, details.status || 500);
  }
};
