// These two campaigns promote social/video content, as specified by the account owner.
const SOCIAL_CAMPAIGNS=new Set(['23863935806','23871949843']);
export function isSocialAd(row){return row.spendScope==='social'||SOCIAL_CAMPAIGNS.has(String(row.campaignId))||row.channel==='VIDEO'||/youtube|you\s*tube|油管/i.test(row.campaign||'')}
