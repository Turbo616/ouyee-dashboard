const SITES = [
  { id: "oydisplay", name: "OYDisplay", domain: "oydisplay.com", propertyId: "484489968", color: "#00d4ff" },
  { id: "ouyedisplay", name: "OUYEE Display", domain: "ouyedisplay.com", propertyId: "358897531", color: "#1dff9b" },
  { id: "focusstoredisplay", name: "Focus Store Display", domain: "focusstoredisplay.com", propertyId: "", color: "#ffd166" }
];

const UNKNOWN_KEYS = new Set(["", "(unknown)", "unknown", "(not set)", "not set", "未知", "(未知)"]);

const state = {
  selectedSites: new Set(SITES.map((s) => s.id)),
  focusSiteId: localStorage.getItem("focus_site_id") || "oydisplay",
  lang: localStorage.getItem("ui_lang") || "zh",
  showUnknown: localStorage.getItem("show_unknown") === "1",
  allDates: [],
  statusText: "",
  statusIsError: false,
  store: Object.fromEntries(
    SITES.map((s) => [
      s.id,
      {
        ga4: { source: "none", dataByDate: {}, channels: {}, devices: {}, topPages: [] },
        leads: {
          total: 0,
          daily: {},
          countries: {},
          storeTypes: {},
          owners: {},
          countryDaily: {},
          storeTypeDaily: {},
          ownerDaily: {}
        },
        gsc: {
          siteUrl: null,
          error: null,
          kpi: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
          topQueries: [],
          topPages: [],
          trendDaily: []
        }
      }
    ])
  ),
  charts: { trend: null, gscTrend: null, country: null, storeType: null, owner: null }
};

const I18N = {
  zh: {
    titleMain: "多站点数据追踪中心",
    labelFocus: "当前聚焦站点（固定映射）",
    labelProperty: "GA4 Property ID",
    labelSites: "站点选择（可多选）",
    labelRange: "时间范围",
    labelStart: "开始",
    labelEnd: "结束",
    labelUnknown: "显示 Unknown 分类（默认关闭）",
    hintText: "询盘来自 Google Sheets（手动登记），GA4 / GSC 用于流量和排名分析。",
    titleOverview: "网站与询盘总览",
    cardTrendTitle: "流量趋势（GA4）",
    cardTrendSub: "Sessions / Day",
    cardGscTrendTitle: "GSC 平均排名趋势",
    cardGscTrendSub: "Position / Day",
    cardCountryTitle: "询盘来源国家",
    cardStoreTitle: "店铺类型分布",
    cardOwnerTitle: "跟进人占比",
    sheetLeadsLabel: "Google Sheet Leads",
    tableLeadSummaryTitle: "站点询盘汇总",
    tableLeadSummarySub: "按当前时间范围统计",
    thSite: "站点",
    thLeads: "询盘",
    thTopCountry: "Top 国家",
    thTopStore: "Top 店铺类型",
    thTopOwner: "Top 跟进人",
    gscKeywordTitle: "GSC Top Keywords",
    gscPageTitle: "GSC Top Pages",
    gscTableSub: "Clicks / Impressions / CTR / Position",
    thGscSite: "站点",
    thGscKeyword: "关键词",
    thGscPage: "页面",
    thClicks: "Clicks",
    thImpr: "Impr.",
    thCtr: "CTR",
    thPos: "Pos.",
    btnRefresh: "刷新数据",
    btnCheck: "校验映射",
    statusWaiting: "等待同步",
    statusSyncing: "正在同步 GA4 + Google Sheet + GSC...",
    statusSynced: "数据同步完成：GA4 + Google Sheet + GSC",
    kpiLeads: "询盘数（Sheet）",
    kpiLeadRate: "询盘率",
    kpiClicks: "GSC 点击",
    kpiImpr: "GSC 展现",
    kpiCtr: "GSC CTR",
    kpiPos: "GSC 平均排名",
    noBaseline: "无基线",
    vsPrevious: "较上一周期",
    sitesUnit: "个站点",
    rangeJoiner: "至",
    sheetOnly: "仅 Sheet"
  },
  en: {
    titleMain: "Multi-Site Tracking Hub",
    labelFocus: "Focused Site (Fixed Mapping)",
    labelProperty: "GA4 Property ID",
    labelSites: "Site Selection (Multi-select)",
    labelRange: "Date Range",
    labelStart: "Start",
    labelEnd: "End",
    labelUnknown: "Show Unknown categories (off by default)",
    hintText: "Leads come from Google Sheets. GA4/GSC are used for traffic and ranking analysis.",
    titleOverview: "Site & Lead Overview",
    cardTrendTitle: "Traffic Trend (GA4)",
    cardTrendSub: "Sessions / Day",
    cardGscTrendTitle: "GSC Avg Position Trend",
    cardGscTrendSub: "Position / Day",
    cardCountryTitle: "Lead Countries",
    cardStoreTitle: "Store Type Distribution",
    cardOwnerTitle: "Owner Distribution",
    sheetLeadsLabel: "Google Sheet Leads",
    tableLeadSummaryTitle: "Lead Summary by Site",
    tableLeadSummarySub: "Current date range",
    thSite: "Site",
    thLeads: "Leads",
    thTopCountry: "Top Country",
    thTopStore: "Top Store Type",
    thTopOwner: "Top Owner",
    gscKeywordTitle: "GSC Top Keywords",
    gscPageTitle: "GSC Top Pages",
    gscTableSub: "Clicks / Impressions / CTR / Position",
    thGscSite: "Site",
    thGscKeyword: "Keyword",
    thGscPage: "Page",
    thClicks: "Clicks",
    thImpr: "Impr.",
    thCtr: "CTR",
    thPos: "Pos.",
    btnRefresh: "Refresh Data",
    btnCheck: "Check Mapping",
    statusWaiting: "Waiting for sync",
    statusSyncing: "Syncing GA4 + Google Sheet + GSC...",
    statusSynced: "Data synced: GA4 + Google Sheet + GSC",
    kpiLeads: "Leads (Sheet)",
    kpiLeadRate: "Lead Rate",
    kpiClicks: "GSC Clicks",
    kpiImpr: "GSC Impressions",
    kpiCtr: "GSC CTR",
    kpiPos: "GSC Avg Position",
    noBaseline: "No baseline",
    vsPrevious: "vs previous",
    sitesUnit: "sites",
    rangeJoiner: "to",
    sheetOnly: "Sheet only"
  }
};

function t(key) {
  return I18N[state.lang]?.[key] || I18N.en[key] || key;
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(s) {
  return new Date(`${s}T00:00:00`);
}

function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

function makeDateSpan(days = 150) {
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(formatDate(addDays(now, -i)));
  return out;
}

function diffDays(start, end) {
  return Math.floor((end - start) / 86400000) + 1;
}

function fmtNum(n) {
  const locale = state.lang === "zh" ? "zh-CN" : "en-US";
  return new Intl.NumberFormat(locale).format(Math.round(n || 0));
}

function fmtPct(v, digits = 2) {
  return `${((v || 0) * 100).toFixed(digits)}%`;
}

function delta(current, prev, inverse = false) {
  if (!prev) return { text: t("noBaseline"), cls: "" };
  const raw = ((current - prev) / prev) * 100;
  const adj = inverse ? -raw : raw;
  const cls = adj >= 0 ? "up" : "down";
  return { text: `${adj >= 0 ? "+" : ""}${adj.toFixed(1)}% ${t("vsPrevious")}`, cls };
}

function setStatus(msg, isError = false) {
  state.statusText = msg;
  state.statusIsError = isError;
  const el = document.getElementById("ga4Status");
  el.textContent = msg;
  el.style.color = isError ? "#ff7b72" : "#a8b8d8";
}

function getFocusSite() {
  return SITES.find((s) => s.id === state.focusSiteId) || SITES[0];
}

function setFocusSite(siteId) {
  state.focusSiteId = siteId;
  localStorage.setItem("focus_site_id", siteId);
  const site = getFocusSite();
  document.getElementById("propertyIdInput").value = site.propertyId || t("sheetOnly");
}

function setupDateRange() {
  const end = state.allDates[state.allDates.length - 1];
  const start = state.allDates[Math.max(0, state.allDates.length - 30)];
  document.getElementById("startDate").value = start;
  document.getElementById("endDate").value = end;
}

function getRangeDates() {
  const start = parseDate(document.getElementById("startDate").value);
  const end = parseDate(document.getElementById("endDate").value);
  return state.allDates.filter((d) => {
    const day = parseDate(d);
    return day >= start && day <= end;
  });
}

function isUnknownKey(key) {
  const normalized = String(key || "").trim().toLowerCase();
  return UNKNOWN_KEYS.has(normalized);
}

function topNEntries(map, n = 8, hideUnknown = false) {
  return Object.entries(map || {})
    .filter(([, v]) => Number(v || 0) > 0)
    .filter(([k]) => (hideUnknown ? !isUnknownKey(k) : true))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, n);
}

function mergeCountMap(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + Number(value || 0);
  });
  return target;
}

function mapForDateRangeFromDaily(leads, dailyField, fallbackField, dates) {
  const out = {};
  const dailyMap = leads[dailyField] || {};
  if (Object.keys(dailyMap).length) {
    dates.forEach((d) => {
      mergeCountMap(out, dailyMap[d] || {});
    });
    return out;
  }
  return { ...(leads[fallbackField] || {}) };
}

async function loadGa4ForProperty(propertyId) {
  const endDate = new Date();
  const startDate = addDays(endDate, -149);
  const url = `/api/ga4/dashboard?propertyId=${encodeURIComponent(propertyId)}&startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`;
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "GA4 request failed");

  const dataByDate = {};
  (payload.perDay || []).forEach((r) => {
    dataByDate[r.date] = {
      sessions: Number(r.sessions) || 0,
      users: Number(r.users) || 0,
      pageviews: Number(r.pageviews) || 0,
      conversions: Number(r.conversions) || 0,
      bounceRate: Number(r.bounceRate) || 0,
      avgDuration: Number(r.avgDuration) || 0,
      revenue: Number(r.revenue) || 0
    };
  });

  return {
    source: "ga4",
    dataByDate,
    channels: payload.channels || {},
    devices: payload.devices || {},
    topPages: payload.topPages || []
  };
}

async function loadLeadsSheet() {
  const res = await fetch("/api/leads/sheet");
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Sheet request failed");
  return payload;
}

async function discoverProperties() {
  const res = await fetch("/api/ga4/discover");
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Discover failed");
  return payload.properties || [];
}

async function loadGscSummary(startDate, endDate, siteIds) {
  const sites = siteIds.join(",");
  const url = `/api/gsc/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&sites=${encodeURIComponent(sites)}`;
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "GSC request failed");
  return payload;
}

function applyLanguage() {
  const map = [
    ["titleMain", "titleMain"],
    ["labelFocus", "labelFocus"],
    ["labelProperty", "labelProperty"],
    ["labelSites", "labelSites"],
    ["labelRange", "labelRange"],
    ["labelStart", "labelStart"],
    ["labelEnd", "labelEnd"],
    ["labelUnknown", "labelUnknown"],
    ["hintText", "hintText"],
    ["titleOverview", "titleOverview"],
    ["cardTrendTitle", "cardTrendTitle"],
    ["cardTrendSub", "cardTrendSub"],
    ["cardGscTrendTitle", "cardGscTrendTitle"],
    ["cardGscTrendSub", "cardGscTrendSub"],
    ["cardCountryTitle", "cardCountryTitle"],
    ["cardStoreTitle", "cardStoreTitle"],
    ["cardOwnerTitle", "cardOwnerTitle"],
    ["sheetLeadsLabel1", "sheetLeadsLabel"],
    ["sheetLeadsLabel2", "sheetLeadsLabel"],
    ["sheetLeadsLabel3", "sheetLeadsLabel"],
    ["tableLeadSummaryTitle", "tableLeadSummaryTitle"],
    ["tableLeadSummarySub", "tableLeadSummarySub"],
    ["thSite", "thSite"],
    ["thLeads", "thLeads"],
    ["thTopCountry", "thTopCountry"],
    ["thTopStore", "thTopStore"],
    ["thTopOwner", "thTopOwner"],
    ["gscKeywordTitle", "gscKeywordTitle"],
    ["gscPageTitle", "gscPageTitle"],
    ["gscTableSub1", "gscTableSub"],
    ["gscTableSub2", "gscTableSub"],
    ["thGscSite1", "thGscSite"],
    ["thGscSite2", "thGscSite"],
    ["thGscKeyword", "thGscKeyword"],
    ["thGscPage", "thGscPage"],
    ["thClicks1", "thClicks"],
    ["thClicks2", "thClicks"],
    ["thImpr1", "thImpr"],
    ["thImpr2", "thImpr"],
    ["thCtr1", "thCtr"],
    ["thCtr2", "thCtr"],
    ["thPos1", "thPos"],
    ["thPos2", "thPos"]
  ];

  map.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  });

  const refreshBtn = document.getElementById("connectGa4Btn");
  const checkBtn = document.getElementById("discoverGa4Btn");
  if (refreshBtn) refreshBtn.textContent = t("btnRefresh");
  if (checkBtn) checkBtn.textContent = t("btnCheck");

  document.getElementById("langZhBtn")?.classList.toggle("active", state.lang === "zh");
  document.getElementById("langEnBtn")?.classList.toggle("active", state.lang === "en");

  if (state.statusText) {
    setStatus(state.statusText, state.statusIsError);
  } else {
    setStatus(t("statusWaiting"));
  }
}

function renderSiteList() {
  const root = document.getElementById("siteList");
  root.innerHTML = "";

  SITES.forEach((site) => {
    const selected = state.selectedSites.has(site.id);
    const focused = site.id === state.focusSiteId;
    const el = document.createElement("div");
    el.className = `site-item ${selected ? "active" : ""} ${focused ? "focused" : ""}`;
    el.innerHTML = `
      <div>
        <strong>${site.name}</strong>
        <div class="site-domain">${site.domain}</div>
        <div class="site-domain">Property: ${site.propertyId || t("sheetOnly")}</div>
      </div>
      <span class="site-dot" style="background:${site.color};"></span>
    `;
    el.addEventListener("click", async () => {
      if (selected && state.selectedSites.size > 1) state.selectedSites.delete(site.id);
      else state.selectedSites.add(site.id);
      setFocusSite(site.id);
      renderSiteList();
      await refreshGscOnly();
      renderDashboard();
    });
    root.appendChild(el);
  });
}

function aggregateForSelected(siteIds, dates) {
  const out = {
    sessions: 0,
    users: 0,
    pageviews: 0,
    conversions: 0,
    revenue: 0,
    avgDurationWeighted: 0,
    bounceWeighted: 0,
    leads: 0,
    leadRate: 0,
    conversionRate: 0,
    bounceRate: 0,
    avgDuration: 0,
    trendBySite: {},
    countries: {},
    storeTypes: {},
    owners: {},
    gscClicks: 0,
    gscImpressions: 0,
    gscCtrWeighted: 0,
    gscPositionWeighted: 0,
    gscCtr: 0,
    gscPosition: 0
  };

  siteIds.forEach((siteId) => {
    const item = state.store[siteId];
    out.trendBySite[siteId] = [];

    dates.forEach((d) => {
      const row = item.ga4.dataByDate[d];
      if (!row) {
        out.trendBySite[siteId].push(0);
      } else {
        out.trendBySite[siteId].push(row.sessions);
        out.sessions += row.sessions;
        out.users += row.users;
        out.pageviews += row.pageviews;
        out.conversions += row.conversions;
        out.revenue += row.revenue;
        out.avgDurationWeighted += row.avgDuration * row.sessions;
        out.bounceWeighted += row.bounceRate * row.sessions;
      }
      out.leads += Number(item.leads.daily[d] || 0);
    });

    mergeCountMap(out.countries, mapForDateRangeFromDaily(item.leads, "countryDaily", "countries", dates));
    mergeCountMap(out.storeTypes, mapForDateRangeFromDaily(item.leads, "storeTypeDaily", "storeTypes", dates));
    mergeCountMap(out.owners, mapForDateRangeFromDaily(item.leads, "ownerDaily", "owners", dates));

    const gsc = item.gsc?.kpi || {};
    out.gscClicks += Number(gsc.clicks || 0);
    out.gscImpressions += Number(gsc.impressions || 0);
    out.gscCtrWeighted += Number(gsc.ctr || 0) * Number(gsc.impressions || 0);
    out.gscPositionWeighted += Number(gsc.position || 0) * Number(gsc.impressions || 0);
  });

  out.conversionRate = out.sessions ? out.conversions / out.sessions : 0;
  out.leadRate = out.sessions ? out.leads / out.sessions : 0;
  out.bounceRate = out.sessions ? out.bounceWeighted / out.sessions : 0;
  out.avgDuration = out.sessions ? out.avgDurationWeighted / out.sessions : 0;
  out.gscCtr = out.gscImpressions ? out.gscCtrWeighted / out.gscImpressions : 0;
  out.gscPosition = out.gscImpressions ? out.gscPositionWeighted / out.gscImpressions : 0;

  return out;
}

function pickPreviousDates(currentDates) {
  if (!currentDates.length) return [];
  const start = parseDate(currentDates[0]);
  const end = parseDate(currentDates[currentDates.length - 1]);
  const len = diffDays(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return state.allDates.filter((d) => {
    const day = parseDate(d);
    return day >= prevStart && day <= prevEnd;
  });
}

function renderKpis(current, previous) {
  const items = [
    { name: t("kpiLeads"), value: fmtNum(current.leads), delta: delta(current.leads, previous.leads) },
    { name: t("kpiLeadRate"), value: fmtPct(current.leadRate), delta: delta(current.leadRate, previous.leadRate) },
    { name: t("kpiClicks"), value: fmtNum(current.gscClicks), delta: delta(current.gscClicks, previous.gscClicks) },
    { name: t("kpiImpr"), value: fmtNum(current.gscImpressions), delta: delta(current.gscImpressions, previous.gscImpressions) },
    { name: t("kpiCtr"), value: fmtPct(current.gscCtr), delta: delta(current.gscCtr, previous.gscCtr) },
    { name: t("kpiPos"), value: current.gscPosition.toFixed(2), delta: delta(current.gscPosition, previous.gscPosition, true) }
  ];

  document.getElementById("kpiGrid").innerHTML = items
    .map(
      (k) => `
      <article class="panel kpi-card">
        <p class="kpi-name">${k.name}</p>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-delta ${k.delta.cls || ""}">${k.delta.text}</div>
      </article>`
    )
    .join("");
}

function upsertChart(name, config, canvasId) {
  if (state.charts[name]) state.charts[name].destroy();
  state.charts[name] = new Chart(document.getElementById(canvasId), config);
}

function renderTrendChart(dates, agg, selectedIds) {
  const datasets = selectedIds.map((siteId) => {
    const site = SITES.find((s) => s.id === siteId);
    return {
      label: site.domain,
      data: agg.trendBySite[siteId],
      borderColor: site.color,
      backgroundColor: `${site.color}55`,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.35,
      fill: false
    };
  });

  upsertChart(
    "trend",
    {
      type: "line",
      data: { labels: dates.map((d) => d.slice(5)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#dce7ff" } } },
        scales: {
          x: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.05)" } }
        }
      }
    },
    "trendChart"
  );
}

function renderGscTrendChart(dates, siteIds) {
  const datasets = siteIds.map((siteId) => {
    const site = SITES.find((s) => s.id === siteId);
    const dailyMap = {};
    (state.store[siteId].gsc?.trendDaily || []).forEach((r) => {
      const d = String(r.date || "");
      if (!d) return;
      dailyMap[d] = Number(r.position || 0);
    });
    return {
      label: site.domain,
      data: dates.map((d) => (dailyMap[d] != null ? dailyMap[d] : null)),
      borderColor: site.color,
      backgroundColor: `${site.color}55`,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.35,
      fill: false
    };
  });

  upsertChart(
    "gscTrend",
    {
      type: "line",
      data: { labels: dates.map((d) => d.slice(5)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#dce7ff" } } },
        scales: {
          x: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: {
            reverse: true,
            ticks: { color: "#9fb3d1" },
            grid: { color: "rgba(255,255,255,0.05)" }
          }
        }
      }
    },
    "gscTrendChart"
  );
}

function renderHorizontalBar(canvasId, chartName, map, color) {
  const entries = topNEntries(map, 8, !state.showUnknown);
  upsertChart(
    chartName,
    {
      type: "bar",
      data: {
        labels: entries.map((e) => e[0]),
        datasets: [{ data: entries.map((e) => e[1]), backgroundColor: color }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.04)" } },
          y: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.04)" } }
        }
      }
    },
    canvasId
  );
}

function topLabelForSiteRange(siteId, dates, dimDaily, dimFallback) {
  const leads = state.store[siteId].leads;
  const map = mapForDateRangeFromDaily(leads, dimDaily, dimFallback, dates);
  return topNEntries(map, 1, !state.showUnknown)[0]?.[0] || "-";
}

function renderLeadSummaryTable(siteIds, dates) {
  const tbody = document.getElementById("leadSummaryTable");
  tbody.innerHTML = siteIds
    .map((siteId) => {
      const site = SITES.find((s) => s.id === siteId);
      const leads = state.store[siteId].leads;
      const total = dates.reduce((a, d) => a + Number(leads.daily[d] || 0), 0);
      const topCountry = topLabelForSiteRange(siteId, dates, "countryDaily", "countries");
      const topStore = topLabelForSiteRange(siteId, dates, "storeTypeDaily", "storeTypes");
      const topOwner = topLabelForSiteRange(siteId, dates, "ownerDaily", "owners");
      return `<tr>
        <td>${site.domain}</td>
        <td>${fmtNum(total)}</td>
        <td>${topCountry}</td>
        <td>${topStore}</td>
        <td>${topOwner}</td>
      </tr>`;
    })
    .join("");
}

function renderGscTables(siteIds) {
  const queryRows = [];
  const pageRows = [];
  siteIds.forEach((siteId) => {
    const site = SITES.find((s) => s.id === siteId);
    const gsc = state.store[siteId].gsc || {};
    (gsc.topQueries || []).slice(0, 12).forEach((r) => {
      queryRows.push({
        site: site.domain,
        key: r.query || "(not set)",
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr: Number(r.ctr || 0),
        position: Number(r.position || 0)
      });
    });
    (gsc.topPages || []).slice(0, 12).forEach((r) => {
      pageRows.push({
        site: site.domain,
        key: r.page || "(not set)",
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr: Number(r.ctr || 0),
        position: Number(r.position || 0)
      });
    });
  });

  queryRows.sort((a, b) => b.clicks - a.clicks);
  pageRows.sort((a, b) => b.clicks - a.clicks);

  document.getElementById("gscKeywordTable").innerHTML = queryRows
    .slice(0, 20)
    .map(
      (r) =>
        `<tr><td>${r.site}</td><td>${r.key}</td><td>${fmtNum(r.clicks)}</td><td>${fmtNum(r.impressions)}</td><td>${fmtPct(r.ctr)}</td><td>${r.position.toFixed(2)}</td></tr>`
    )
    .join("");

  document.getElementById("gscPageTable").innerHTML = pageRows
    .slice(0, 20)
    .map(
      (r) =>
        `<tr><td>${r.site}</td><td>${r.key}</td><td>${fmtNum(r.clicks)}</td><td>${fmtNum(r.impressions)}</td><td>${fmtPct(r.ctr)}</td><td>${r.position.toFixed(2)}</td></tr>`
    )
    .join("");
}

function renderHeader(siteIds, dates) {
  document.getElementById("selectedSummary").textContent = `${siteIds.length} ${t("sitesUnit")}`;
  document.getElementById("rangeSummary").textContent = `${dates[0] || "-"} ${t("rangeJoiner")} ${dates[dates.length - 1] || "-"}`;
}

function renderDashboard() {
  const siteIds = Array.from(state.selectedSites);
  const dates = getRangeDates();
  const prevDates = pickPreviousDates(dates);
  const current = aggregateForSelected(siteIds, dates);
  const previous = aggregateForSelected(siteIds, prevDates);

  renderHeader(siteIds, dates);
  renderKpis(current, previous);
  renderTrendChart(dates, current, siteIds);
  renderGscTrendChart(dates, siteIds);
  renderHorizontalBar("countryChart", "country", current.countries, "#00d4ff");
  renderHorizontalBar("storeTypeChart", "storeType", current.storeTypes, "#1dff9b");
  renderHorizontalBar("ownerChart", "owner", current.owners, "#ffd166");
  renderLeadSummaryTable(siteIds, dates);
  renderGscTables(siteIds);
}

async function refreshGscOnly() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const selected = SITES.filter((s) => state.selectedSites.has(s.id));
  const gscPayload = await loadGscSummary(startDate, endDate, selected.map((s) => s.id));
  Object.entries(gscPayload.perSite || {}).forEach(([siteId, info]) => {
    if (!state.store[siteId]) return;
    state.store[siteId].gsc = {
      siteUrl: info.siteUrl || null,
      error: info.error || null,
      kpi: info.kpi || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      topQueries: info.topQueries || [],
      topPages: info.topPages || [],
      trendDaily: info.trendDaily || []
    };
  });
}

async function refreshAllData() {
  setStatus(t("statusSyncing"));
  const selected = SITES.filter((s) => state.selectedSites.has(s.id));

  await Promise.all(
    selected.map(async (site) => {
      if (!site.propertyId) return;
      try {
        state.store[site.id].ga4 = await loadGa4ForProperty(site.propertyId);
      } catch {
        state.store[site.id].ga4 = { source: "error", dataByDate: {}, channels: {}, devices: {}, topPages: [] };
      }
    })
  );

  try {
    const leadsPayload = await loadLeadsSheet();
    Object.entries(leadsPayload.perSite || {}).forEach(([siteId, bucket]) => {
      if (!state.store[siteId]) return;
      state.store[siteId].leads = {
        total: Number(bucket.total || 0),
        daily: bucket.daily || {},
        countries: bucket.countries || {},
        storeTypes: bucket.storeTypes || {},
        owners: bucket.owners || {},
        countryDaily: bucket.countryDaily || {},
        storeTypeDaily: bucket.storeTypeDaily || {},
        ownerDaily: bucket.ownerDaily || {}
      };
    });
  } catch (err) {
    setStatus(`GA4 synced, Sheet failed: ${err.message}`, true);
    return;
  }

  try {
    await refreshGscOnly();
    setStatus(t("statusSynced"));
  } catch (err) {
    setStatus(`GA4/Sheet synced, GSC failed: ${err.message}`, true);
  }
}

async function checkMapping() {
  try {
    const list = await discoverProperties();
    const ids = new Set(list.map((x) => String(x.propertyId)));
    const missing = SITES.filter((s) => s.propertyId && !ids.has(s.propertyId)).map((s) => s.propertyId);
    if (!missing.length) setStatus("Fixed GA4 mapping check passed.");
    else setStatus(`Mapping warning: missing property ${missing.join(", ")}`, true);
  } catch (err) {
    setStatus(`Discover check failed: ${err.message}`, true);
  }
}

function wireEvents() {
  const rerenderWithGscRefresh = async () => {
    try {
      setStatus(t("statusSyncing"));
      await refreshGscOnly();
      setStatus(t("statusSynced"));
    } catch (err) {
      setStatus(`GSC refresh failed: ${err.message}`, true);
    }
    renderDashboard();
  };

  document.getElementById("startDate").addEventListener("change", rerenderWithGscRefresh);
  document.getElementById("endDate").addEventListener("change", rerenderWithGscRefresh);

  document.querySelectorAll(".quick-range button[data-days]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".quick-range button[data-days]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const days = Number(btn.dataset.days);
      const end = parseDate(state.allDates[state.allDates.length - 1]);
      const start = addDays(end, -(days - 1));
      document.getElementById("startDate").value = formatDate(start);
      document.getElementById("endDate").value = formatDate(end);
      await rerenderWithGscRefresh();
    });
  });

  document.getElementById("toggleUnknown").addEventListener("change", () => {
    state.showUnknown = document.getElementById("toggleUnknown").checked;
    localStorage.setItem("show_unknown", state.showUnknown ? "1" : "0");
    renderDashboard();
  });

  document.getElementById("connectGa4Btn").addEventListener("click", async () => {
    await refreshAllData();
    renderDashboard();
  });

  document.getElementById("discoverGa4Btn").addEventListener("click", async () => {
    await checkMapping();
  });

  document.getElementById("langZhBtn").addEventListener("click", () => {
    state.lang = "zh";
    localStorage.setItem("ui_lang", "zh");
    applyLanguage();
    setFocusSite(state.focusSiteId);
    renderSiteList();
    renderDashboard();
  });

  document.getElementById("langEnBtn").addEventListener("click", () => {
    state.lang = "en";
    localStorage.setItem("ui_lang", "en");
    applyLanguage();
    setFocusSite(state.focusSiteId);
    renderSiteList();
    renderDashboard();
  });

  const propertyInput = document.getElementById("propertyIdInput");
  propertyInput.readOnly = true;
  propertyInput.title = "Fixed mapping mode";
}

async function init() {
  state.allDates = makeDateSpan(150);
  setupDateRange();
  applyLanguage();
  setFocusSite(state.focusSiteId);
  renderSiteList();
  document.getElementById("toggleUnknown").checked = state.showUnknown;
  wireEvents();
  renderDashboard();
  await refreshAllData();
  renderDashboard();
}

init();
