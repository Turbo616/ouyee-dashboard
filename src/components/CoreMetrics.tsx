import {Inbox,Megaphone,Search,Info} from 'lucide-react';
import type {Dashboard,Site,Period} from '../types';
import {adRows,sumAds,filterLeads,inquiryAcquisition,inquiryAcquisitionSummary,inquiryOpportunityCost,number,money,gptSpendCovered,percentOf,platformInquiryCounts} from '../data';
import {Metric} from './ui';
export function CoreMetrics({data,sites,period}:{data:Dashboard;sites:Site[];period:Period}){
 const leads=filterLeads(data,sites,period),counts=inquiryAcquisitionSummary(leads),platform=platformInquiryCounts(leads),connected=data.leads.connected;
 const googleRows=adRows(data,sites,period,'search'),gptRows=adRows(data,sites,period).filter(r=>r.accountId==='gpt-manual'),allRows=adRows(data,sites,period),currencies=[...new Set(allRows.map(r=>r.currency))],googleCurrencies=[...new Set(googleRows.map(r=>r.currency))];
 const googleCurrency=googleCurrencies[0]||data.accounts[0]?.currency||'CNY',gptCurrency=data.gptAds?.currency||'CNY',googleSpend=sumAds(googleRows).cost,gptSpend=sumAds(gptRows).cost,totalSpend=sumAds(allRows).cost,comparisonSpend=googleSpend+gptSpend;
 const googleMatched=sites.length===data.sites.length||data.accounts.some(a=>a.daily.some(r=>r.domain&&sites.some(s=>s.domain===r.domain))),gptGroup=data.sites.find(s=>s.domain===data.gptAds?.domain)?.group,gptMatched=!!gptGroup&&sites.some(s=>s.group===gptGroup);
 const googleAvailable=data.accounts.length>0&&googleMatched&&period.start>=data.period.previousStart&&period.end<=data.period.end&&googleCurrencies.length<=1,gptOverlap=gptMatched&&!!data.gptAds&&period.start<=data.gptAds.end&&period.end>=data.gptAds.start,gptComplete=gptSpendCovered(data,sites,period),allComplete=connected&&(googleAvailable||gptOverlap)&&currencies.length<=1;
 const whatsapp=leads.filter(r=>r.contactMethod==='WhatsApp'||r.channel==='WhatsApp'),waPaid=whatsapp.filter(r=>inquiryAcquisition(r)==='广告询盘').length,waNatural=whatsapp.filter(r=>inquiryAcquisition(r)==='自然 / AI 推荐询盘').length,googleWa=whatsapp.filter(r=>r.channel==='Google Ads').length,gptWa=whatsapp.filter(r=>r.channel==='GPT Ads').length;
 const count=(n:number)=>connected?number(n):'—',pct=(n:number|null)=>n===null?'—':number(n,1)+'%',inquiryShare=(n:number)=>connected?pct(percentOf(n,counts.total)):'—',spendShare=(n:number)=>currencies.length>1?'—':pct(percentOf(n,comparisonSpend)),cost=(value:number,n:number,ready:boolean,currency:string)=>money(inquiryOpportunityCost(value,n,connected&&ready),currency);
 const googleCostFoot=googleAvailable?'谷歌搜索广告花费 ÷ 谷歌广告询盘':'广告报表未覆盖完整周期，暂不计算',gptCostFoot=gptOverlap?'已读取 GPT 广告花费 ÷ GPT 广告询盘':'所选日期暂无可用花费',totalCostFoot=currencies.length>1?'币种不同，暂不合并计算':!googleAvailable&&!gptOverlap?'所选日期暂无可用花费':null;
 return <section className="core-metrics" aria-label="核心获客数据"><div className="core-heading"><h2>核心获客数据</h2><span className="muted">{period.start} — {period.end} · 所有询盘包含 WhatsApp 登记</span></div><div className="metrics-grid core-grid">
 <Metric label="官网总花费" value={currencies.length>1?'多币种，未合并':money(googleAvailable||gptOverlap?totalSpend:null,currencies[0]||googleCurrency)} foot="谷歌广告 + GPT 广告已读取花费" icon={<Megaphone size={19}/>}/>
 <Metric label="官网总询盘" value={count(counts.total)} foot={`包含 WhatsApp ${number(whatsapp.length)} 条${counts.unmarked?` · 未标来源 ${number(counts.unmarked)} 条`:''}`} icon={<Inbox size={19}/>}/>
 <Metric label="官网广告询盘" value={count(counts.paid)} foot={`占总询盘 ${inquiryShare(counts.paid)} · 包含 WhatsApp ${number(waPaid)} 条`} icon={<Megaphone size={19}/>}/>
 <Metric label="官网自然询盘" value={count(counts.natural)} foot={`占总询盘 ${inquiryShare(counts.natural)} · 包含 WhatsApp ${number(waNatural)} 条`} icon={<Search size={19}/>}/>
 <Metric label="总询盘成本" value={cost(totalSpend,counts.total,allComplete,currencies[0]||googleCurrency)} foot={totalCostFoot||'官网总花费 ÷ 官网总询盘'} icon={<Inbox size={19}/>}/>
 <Metric label="谷歌广告花费" value={googleCurrencies.length>1?'多币种，未合并':money(googleAvailable?googleSpend:null,googleCurrency)} foot="Google Ads 搜索广告" icon={<Megaphone size={19}/>}/>
 <Metric label="谷歌广告询盘" value={count(platform.google)} foot={`SEM / Google Ads · 包含 WhatsApp ${number(googleWa)} 条`} icon={<Megaphone size={19}/>}/>
 <Metric label="谷歌广告询盘成本" value={cost(googleSpend,platform.google,googleAvailable,googleCurrency)} foot={googleCostFoot} icon={<Megaphone size={19}/>}/>
 <Metric label="谷歌广告花费占比" value={googleAvailable?spendShare(googleSpend):'—'} foot="谷歌花费 ÷ 两平台已读取花费" icon={<Megaphone size={19}/>}/>
 <Metric label="谷歌广告询盘占比" value={inquiryShare(platform.google)} foot="谷歌广告询盘 ÷ 官网总询盘" icon={<Inbox size={19}/>}/>
 <Metric label="ChatGPT 广告花费" value={money(gptOverlap?gptSpend:null,gptCurrency)} foot={gptOverlap?`固定汇率 ${data.gptAds?.exchangeRate||7} · 已读取花费`:data.gptAds?gptMatched?'所选日期不在报表覆盖范围':'所选网站暂无对应报表':'广告花费尚未接入'} icon={<Megaphone size={19}/>}/>
 <Metric label="GPT 广告询盘" value={count(platform.gpt)} foot={`GPT Ads · 包含 WhatsApp ${number(gptWa)} 条`} icon={<Megaphone size={19}/>}/>
 <Metric label="GPT 广告询盘成本" value={cost(gptSpend,platform.gpt,gptOverlap,gptCurrency)} foot={gptCostFoot} icon={<Megaphone size={19}/>}/>
 <Metric label="GPT 广告花费占比" value={gptOverlap?spendShare(gptSpend):'—'} foot="GPT 花费 ÷ 两平台已读取花费" icon={<Megaphone size={19}/>}/>
 <Metric label="GPT 广告询盘占比" value={inquiryShare(platform.gpt)} foot="GPT 广告询盘 ÷ 官网总询盘" icon={<Inbox size={19}/>}/>
 </div>{data.gptAds&&!gptComplete&&<div className="notice"><Info size={17}/><span>ChatGPT 广告报表仅覆盖 {data.gptAds.start} 至 {data.gptAds.end}，花费及花费占比显示已读取部分。成本按已读取花费 ÷ 所选日期的对应询盘数直接计算，后续报表更新后会重新计算。</span></div>}{!data.gptAds&&platform.gpt>0&&<div className="notice"><Info size={17}/><span>ChatGPT 广告花费尚未接入，对应成本暂不计算。</span></div>}{(period.start<'2026-10-01'||counts.unmarked>0)&&<div className="notice"><Info size={17}/><span>{period.start<'2026-10-01'?'2026 年 10 月前来源登记不完整，历史渠道占比与成本仅供参考。':''}{counts.unmarked>0?` ${number(counts.unmarked)} 条来源未标注，计入总询盘，不归入广告或自然。`:''}WhatsApp 是接收方式，已包含在各来源询盘数中，请勿重复相加。</span></div>}</section>
}
