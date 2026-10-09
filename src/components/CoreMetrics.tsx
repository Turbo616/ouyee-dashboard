import {Inbox,Megaphone,Search,Info} from 'lucide-react';
import type {Dashboard,Site,Period} from '../types';
import {adRows,sumAds,filterLeads,inquiryAcquisitionSummary,inquiryOpportunityCost,number,money} from '../data';
import {Metric} from './ui';
export function CoreMetrics({data,sites,period}:{data:Dashboard;sites:Site[];period:Period}){
 const leads=filterLeads(data,sites,period),gpt=leads.filter(r=>r.channel==='GPT Ads').length,counts=inquiryAcquisitionSummary(leads),rows=adRows(data,sites,period),allAds=adRows(data,sites,period,'all'),currencies=[...new Set(allAds.map(r=>r.currency))],spend=sumAds(rows).cost,hasSpend=allAds.length>0&&currencies.length===1&&period.start>=data.period.previousStart&&period.end<=data.period.end,connected=data.leads.connected,hasCosts=connected&&hasSpend&&gpt===0,historical=period.start<'2026-10-01';
 const share=(n:number|null)=>connected&&n!==null?number(n,1)+'%':'—',cost=(n:number)=>money(inquiryOpportunityCost(spend,n,hasCosts),currencies[0]);
 return <section className="core-metrics" aria-label="核心获客数据"><div className="core-heading"><h2>核心获客数据</h2><span className="muted">{period.start} — {period.end} · 总询盘 {connected?number(counts.total):'—'} 条</span></div><div className="metrics-grid core-grid">
 <Metric label="广告询盘" value={connected?number(counts.paid):'—'} foot={`占总询盘 ${share(counts.paidShare)} · SEM / Google Ads / GPT Ads`} icon={<Megaphone size={19}/>}/>
 <Metric label="自然流量询盘" value={connected?number(counts.natural):'—'} foot={`占总询盘 ${share(counts.naturalShare)} · SEO / AI / GPT 等`} icon={<Search size={19}/>}/>
 <Metric label="已接入广告花费" value={currencies.length>1?'多币种，未合并':money(hasSpend?spend:null,currencies[0])} foot="Google Ads 花费 · 不含社媒及未接入的 GPT Ads" icon={<Megaphone size={19}/>}/>
 <Metric label="广告询盘成本" value={cost(counts.paid)} foot={gpt?'GPT Ads 花费未接入，暂不计算':'广告花费 ÷ 广告询盘数'} icon={<Megaphone size={19}/>}/>
 <Metric label="总询盘成本" value={cost(counts.total)} foot={gpt?'GPT Ads 花费未接入，暂不计算':'广告花费 ÷ 全部登记询盘数'} icon={<Inbox size={19}/>}/>
 <Metric label="总询盘" value={connected?number(counts.total):'—'} foot={counts.unmarked?`${number(counts.unmarked)} 条来源未标注，已单独保留`:'全部登记来源已标注'} icon={<Inbox size={19}/>}/>
 </div>{gpt>0&&<div className="notice"><Info size={17}/><span>当前有 {number(gpt)} 条 GPT Ads 询盘，已计入广告询盘。GPT Ads 花费尚未接入，因此当前花费仅为 Google Ads 已接入金额，广告询盘成本和总询盘成本暂不计算。</span></div>}{(historical||counts.unmarked>0)&&<div className="notice"><Info size={17}/><span>{historical?'2026 年 10 月前的来源登记不完整，所选周期的渠道占比和广告询盘成本仅供参考。':'2026 年 10 月起按完整渠道登记统计。'}{counts.unmarked>0?`当前有 ${number(counts.unmarked)} 条来源未标注，计入总询盘，但不归入广告或自然；两类占比因此可能不足 100%。`:''}</span></div>}</section>
}
