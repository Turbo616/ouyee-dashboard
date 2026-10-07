import assert from 'node:assert/strict';
import {normalizeSheetTables,sourceDate,sourceChannel,syncLeadsSheet} from '../cloud/sheet-leads.js';
const sites=[{domain:'ouyedisplay.com',group:'欧野'},{domain:'oydisplay.com',group:'欧野'}];
const header=['渠道','日期','客户名称','邮箱','电话','国家','店铺','信息','跟进人','询盘来源URL','Remote IP','Gmail邮件ID'];
const a=['SEM','2026年9月20日','Test A','test@example.test','','US','','','','https://ouyedisplay.com/contact/','','mail-a'];
const b=['SEO','2026年9月21日','Test B','b@example.test','','UK','','','','','','mail-b'];
const whatsapp={sheetId:2,title:'欧野-whatsapp',values:[['','日期','姓名','国家','WhatsApp','类目','客户留言'],['','2026年9月22日','Test W','US','12345','',''],['','','Undated','US','98765','','']]};
const full=normalizeSheetTables([{sheetId:1,title:'欧野1',values:[header,a,b,a]},whatsapp],sites,new Date('2026-10-07T00:00:00Z'));
assert.equal(full.rows.length,4);assert.equal(full.source.duplicateRows,1);assert.equal(full.source.undatedRows,1);assert.equal(full.rows.find(r=>r.contact==='Test W').domain,'');assert.equal(full.rows.find(r=>r.contact==='Test W').group,'欧野');assert.equal(full.qualificationAvailable,false);assert.ok(full.rows.every(r=>r.status==='未标注'));assert.equal(sourceDate('2024//7/8'),'2024-07-08');assert.equal(sourceDate('2026.2.30'),'');assert.equal(sourceChannel('SEM'),'Google Ads');assert.equal(sourceChannel('广告'),'广告（平台未注明）');assert.equal(sourceChannel('欧野官网'),'未知');
const kv=new Map(),env={DASHBOARD_DATA:{async get(k){return kv.has(k)?JSON.parse(kv.get(k)):null},async put(k,v){kv.set(k,v)}}};let values=[header,a,b],calls=0;
async function api(url){calls++;if(url.includes('?fields='))return{properties:{title:'Synthetic test'},sheets:[{properties:{sheetId:1,title:'欧野1',gridProperties:{rowCount:3,columnCount:12}}}]};if(url.includes('8&')||url.includes('8%'))return{valueRanges:[{values:[header]}]};return{valueRanges:[{values}]}}
const first=await syncLeadsSheet(env,sites,true,api);assert.equal(first.rows.length,2);values=[header,[...a.slice(0,5),'CA',...a.slice(6)]];
const second=await syncLeadsSheet(env,sites,true,api);assert.equal(second.rows.length,1);assert.equal(second.rows[0].country,'CA');assert.equal((await syncLeadsSheet(env,sites,true,api)).rows.length,1);
const n=calls;await syncLeadsSheet(env,sites,false,api);assert.equal(calls,n,'fresh cache should avoid upstream requests');const failed=await syncLeadsSheet(env,sites,true,async()=>{throw new Error('Synthetic outage')});assert.equal(failed.rows.length,1);assert.equal(failed.rows[0].country,'CA');assert.equal(failed.source.error,'Synthetic outage');
console.log('Sheet mapping, dates, explicit channel/status rules, deduplication, edits, deletes, repeated sync, cache and failure retention passed');
