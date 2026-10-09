import assert from 'node:assert/strict';import {collectGoogle} from '../cloud/google.js';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());let gscEnd,adEnd;
const customer={id:'123',descriptiveName:'test',currencyCode:'CNY',timeZone:'Asia/Shanghai',manager:false};
async function api(url,body){
 if(url.includes('spreadsheets')&&url.includes('?fields='))return{properties:{title:'sites'},sheets:[{properties:{sheetId:0,title:'sites'}}]};
 if(url.includes('spreadsheets'))return{values:[['欧野','https://site.test']]};
 if(url.endsWith('/webmasters/v3/sites'))return{siteEntry:[{siteUrl:'sc-domain:site.test'}]};
 if(url.includes('searchAnalytics/query')){gscEnd=body.endDate;assert.equal(body.dataState,'final');return body.dimensions[0]==='date'?{rows:[{keys:[body.endDate],clicks:1,impressions:10,ctr:.1,position:1}]}:{rows:[]}}
 if(url.includes('/api/ga4/read'))return{accessibleCount:0,errors:[],sites:[]};
 if(url.endsWith('listAccessibleCustomers'))return{resourceNames:['customers/123']};
 const q=body.query;if(q.includes(' FROM customer')&&!q.includes('segments.'))return{results:[{customer}]};
 if(q.includes(' FROM campaign')){adEnd=q.match(/BETWEEN '[^']+' AND '([^']+)'/)[1];return{results:[{campaign:{id:'1',name:'Search',advertisingChannelType:'SEARCH',status:'ENABLED'},segments:{date:adEnd},metrics:{costMicros:'1000000',impressions:'10',clicks:'1',conversions:'1'}}]}}
 if(q.includes(' FROM ad_group_ad'))return{results:[{campaign:{id:'1'},adGroupAd:{ad:{finalUrls:['https://site.test']}}}]};return{results:[]};
}
const d=await collectGoogle({GOOGLE_ADS_DEVELOPER_TOKEN:'test'},api);assert.equal(d.period.end,today);assert.equal(adEnd,today);assert.equal(d.sites[0].gsc.availableEnd,gscEnd);assert.equal(Math.round((Date.parse(today)-Date.parse(gscEnd))/86400000),3);assert.equal(d.accounts[0].daily[0].date,today);assert.deepEqual(d.errors,[]);console.log('PASS: Ads query and selectable period include Shanghai today; GSC has a separate 3-day final-data cutoff');
