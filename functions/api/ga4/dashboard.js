import { getAccessToken, googleApiRequest, json, normalizeDate, num, simplifyApiError } from "../../_lib/ga4.js";

async function runReport(token, propertyId, body) {
  return googleApiRequest({
    method: "POST",
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    token,
    body
  });
}

export const onRequestGet = async (context) => {
  const { searchParams } = new URL(context.request.url);
  const propertyId = (searchParams.get("propertyId") || "").trim();
  const startDate = (searchParams.get("startDate") || "").trim();
  const endDate = (searchParams.get("endDate") || "").trim();

  if (!/^\d+$/.test(propertyId)) {
    return json({ error: "Invalid propertyId: digits only" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return json({ error: "startDate/endDate must be YYYY-MM-DD" }, 400);
  }

  try {
    const token = await getAccessToken(context.env, "https://www.googleapis.com/auth/analytics.readonly");
    const dateRanges = [{ startDate, endDate }];

    let daily;
    let topPages;
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

      topPages = await runReport(token, propertyId, {
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

      topPages = await runReport(token, propertyId, {
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 12
      });
    }

    const [channelsRes, devicesRes] = await Promise.all([
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

    const channels = {};
    for (const row of channelsRes.rows || []) {
      const k = row.dimensionValues?.[0]?.value || "(not set)";
      channels[k] = num(row.metricValues?.[0]?.value);
    }

    const devices = {};
    for (const row of devicesRes.rows || []) {
      const k = row.dimensionValues?.[0]?.value || "(not set)";
      devices[k] = num(row.metricValues?.[0]?.value);
    }

    const topPagesOut = (topPages.rows || []).map((row) => ({
      path: row.dimensionValues?.[0]?.value || "(not set)",
      sessions: num(row.metricValues?.[0]?.value),
      conversions: num(row.metricValues?.[1]?.value)
    }));

    return json({
      perDay,
      channels,
      devices,
      topPages: topPagesOut
    });
  } catch (err) {
    const details = simplifyApiError(err);
    return json({ error: details.message, details }, details.status || 500);
  }
};
