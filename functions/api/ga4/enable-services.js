import { getAccessToken, googleApiRequest, json, simplifyApiError } from "../../_lib/ga4.js";

export const onRequestPost = async (context) => {
  try {
    const projectId = context.env.GA4_PROJECT_ID;
    if (!projectId) {
      return json({ error: "Missing env GA4_PROJECT_ID" }, 400);
    }

    const token = await getAccessToken(context.env, "https://www.googleapis.com/auth/cloud-platform");
    const services = ["analyticsadmin.googleapis.com", "analyticsdata.googleapis.com"];
    const result = [];

    for (const service of services) {
      const url = `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${service}:enable`;
      try {
        const out = await googleApiRequest({ method: "POST", url, token });
        result.push({ service, ok: true, operation: out.name || null });
      } catch (err) {
        result.push({ service, ok: false, error: simplifyApiError(err) });
      }
    }

    return json({ projectId, result });
  } catch (err) {
    const details = simplifyApiError(err);
    return json({ error: details.message, details }, details.status || 500);
  }
};
