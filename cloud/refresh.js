import {collectGoogle,googleClient} from './google.js';
import {syncLeadsSheet} from './sheet-leads.js';
export async function refreshDashboard(env,trigger='manual'){
 const last=await env.DASHBOARD_DATA.get('refresh',{type:'json'});if(last?.running&&Date.now()-last.at<180000){const e=new Error('已有刷新正在进行，请稍后查看');e.status=409;throw e}
 const startedAt=new Date().toISOString();await env.DASHBOARD_DATA.put('refresh',JSON.stringify({running:true,at:Date.now(),trigger}),{expirationTtl:240});
 if(trigger.startsWith('schedule'))await env.DASHBOARD_DATA.put('scheduled-refresh-status',JSON.stringify({status:'running',startedAt,trigger}));
 try{const client=await googleClient(env);const d=await collectGoogle(env,client);await env.DASHBOARD_DATA.put('latest',JSON.stringify(d));const leads=await syncLeadsSheet(env,d.sites,true,client);const problems=[...d.errors,...d.sites.filter(s=>s.gscError).map(s=>({source:'GSC',message:s.domain+': '+s.gscError})),...(leads.source?.error?[{source:'真实询盘',message:leads.source.error}]:[])];const result={ok:true,checkedAt:d.checkedAt,startedAt,finishedAt:new Date().toISOString(),trigger,status:problems.length?'partial':'success',errors:problems.length,problems,coverage:{websites:d.sites.length,gsc:d.sites.filter(s=>s.gsc).length,ga4:d.sites.filter(s=>s.ga4).length,ads:d.accounts.length,inquiries:leads.rows.length}};
 if(trigger.startsWith('schedule'))await env.DASHBOARD_DATA.put('scheduled-refresh-status',JSON.stringify(result));return result
 }catch(e){if(trigger.startsWith('schedule'))await env.DASHBOARD_DATA.put('scheduled-refresh-status',JSON.stringify({status:'failed',startedAt,finishedAt:new Date().toISOString(),trigger,message:e.message}));throw e}
 finally{await env.DASHBOARD_DATA.put('refresh',JSON.stringify({running:false,at:Date.now(),trigger}),{expirationTtl:240})}
}
