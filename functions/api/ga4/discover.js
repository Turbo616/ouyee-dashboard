import { getAccessToken, googleApiRequest, json, simplifyApiError } from "../../_lib/ga4.js";

export const onRequestGet = async (context) => {
  try {
    const token = await getAccessToken(context.env, "https://www.googleapis.com/auth/analytics.readonly");
    const payload = await googleApiRequest({
      url: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
      token
    });

    const properties = [];
    for (const account of payload.accountSummaries || []) {
      for (const property of account.propertySummaries || []) {
        properties.push({
          account: account.displayName,
          accountName: account.name,
          propertyName: property.displayName,
          property: property.property,
          propertyId: String(property.property || "").split("/").pop()
        });
      }
    }

    return json({ properties });
  } catch (err) {
    const details = simplifyApiError(err);
    return json({ error: details.message, details }, details.status || 500);
  }
};
