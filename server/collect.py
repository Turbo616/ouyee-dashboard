"""Read-only Google collectors. Credentials stay outside the dashboard directory."""
import concurrent.futures,json,os,time
from datetime import datetime,timedelta
from pathlib import Path
from urllib.parse import urlparse,quote
from zoneinfo import ZoneInfo
import requests
from dotenv import dotenv_values
from google.oauth2 import service_account
from google.auth.transport.requests import Request

ROOT=Path(__file__).resolve().parents[1]
DATA_DIR=Path(os.getenv('DASHBOARD_DATA_DIR',str(ROOT.parents[1]/'work'/'ops-dashboard')))
KEY=os.getenv('GOOGLE_APPLICATION_CREDENTIALS','/Volumes/Samsung T7/Codex/.secrets/google-service-account.json')
ADS_ENV=os.getenv('GOOGLE_ADS_ENV_PATH','/Users/yangfengshuo/Documents/Codex/2026-06-21/google-ads-api/.env')
SHEET_ID='1k_wchA0rJw3T1kRhDv8vTRpPl8s9ml3AUMR4I85l9P4'
SCOPES=['spreadsheets.readonly','webmasters.readonly','analytics.readonly','adwords']

def domain(value):
    return (urlparse(value if '://' in value else 'https://'+value).hostname or '').lower().removeprefix('www.')

def total(rows):
    clicks=sum(x['clicks'] for x in rows);impressions=sum(x['impressions'] for x in rows)
    return {'clicks':clicks,'impressions':impressions,'ctr':clicks/impressions if impressions else 0,'position':sum(x['position']*x['impressions'] for x in rows)/impressions if impressions else None}

def collect():
    creds=service_account.Credentials.from_service_account_file(KEY,scopes=['https://www.googleapis.com/auth/'+s for s in SCOPES]);creds.refresh(Request())
    headers={'Authorization':'Bearer '+creds.token}
    env=dotenv_values(ADS_ENV) if Path(ADS_ENV).exists() else {}
    developer_token=env.get('GOOGLE_ADS_DEVELOPER_TOKEN') or os.getenv('GOOGLE_ADS_DEVELOPER_TOKEN')
    now=datetime.now(ZoneInfo('Asia/Shanghai'));end=now.date()-timedelta(days=3);start=end-timedelta(days=27);previous_start=start-timedelta(days=28)
    def api(url,body=None,extra=None):
        for attempt in range(2):
            r=requests.request('POST' if body is not None else 'GET',url,headers={**headers,**(extra or {})},json=body,timeout=35)
            if r.status_code in (429,500,502,503,504) and attempt==0:time.sleep(1);continue
            try:a=r.json()
            except ValueError:raise RuntimeError(f'Google HTTP {r.status_code}')
            if r.status_code!=200:
                raise RuntimeError(f"HTTP {r.status_code}: {a.get('error',{}).get('message','请求失败')[:220]}")
            return a
    # Metadata first, then only names/URLs. Do not persist or print any credential columns.
    meta=api(f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}?fields=properties(title),sheets(properties(sheetId,title))')
    tab=next(x['properties']['title'] for x in meta['sheets'] if x['properties']['sheetId']==0)
    bounds=quote("'"+tab.replace("'","''")+"'!A1:B200",safe='')
    sheet=api(f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{bounds}')
    sites=[];seen=set()
    for row in sheet.get('values',[]):
        if len(row)<2 or not row[1].strip().startswith(('https://','http://')):continue
        host=domain(row[1]);name=row[0] or host
        if not host or host in seen:continue
        seen.add(host);sites.append({'name':name,'domain':host,'url':row[1],'group':'欧野' if name.startswith('欧野') else '观筑' if name.startswith('观筑') else '贝森' if name.startswith('贝森') else '其他','gsc':None,'ga4':None,'ads':None})
    errors=[]
    try:properties=api('https://www.googleapis.com/webmasters/v3/sites').get('siteEntry',[])
    except Exception as e:properties=[];errors.append({'source':'GSC','message':str(e)})
    def gsc_site(site):
        matches=[p['siteUrl'] for p in properties if domain(p['siteUrl'].removeprefix('sc-domain:'))==site['domain']]
        prop=next((p for p in matches if p.startswith('sc-domain:')),None) or next((p for p in matches if p==site['url']),None) or next(iter(matches),None)
        site['gscProperty']=prop
        if not prop:return site
        base='https://www.googleapis.com/webmasters/v3/sites/'+quote(prop,safe='')+'/searchAnalytics/query'
        try:
            raw=api(base,{'startDate':str(previous_start),'endDate':str(end),'dimensions':['date'],'rowLimit':25000,'dataState':'final'}).get('rows',[])
            daily=[{'date':r['keys'][0],'clicks':r['clicks'],'impressions':r['impressions'],'ctr':r['ctr'],'position':r['position']} for r in raw]
            current=[r for r in daily if r['date']>=str(start)];previous=[r for r in daily if r['date']<str(start)]
            site['gsc']={**total(current),'previous':total(previous),'daily':daily,'checkedAt':now.isoformat()}
            site['topPages']=[{'url':r['keys'][0],'clicks':r['clicks'],'impressions':r['impressions'],'position':r['position']} for r in api(base,{'startDate':str(start),'endDate':str(end),'dimensions':['page'],'rowLimit':10,'dataState':'final'}).get('rows',[])]
        except Exception as e:site['gscError']=str(e)
        return site
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:sites=list(pool.map(gsc_site,sites))
    print('GSC:',sum(bool(s['gsc']) for s in sites),'/',len(sites),flush=True)
    ga4_properties=[]
    try:
        page_token=None
        while True:
            url='https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200'+('&pageToken='+quote(page_token,safe='') if page_token else '')
            a=api(url);ga4_properties.extend(p for account in a.get('accountSummaries',[]) for p in account.get('propertySummaries',[]));page_token=a.get('nextPageToken')
            if not page_token:break
        for prop in ga4_properties:
            streams=api('https://analyticsadmin.googleapis.com/v1beta/'+prop['property']+'/dataStreams?pageSize=200').get('dataStreams',[])
            hosts={domain(x.get('webStreamData',{}).get('defaultUri','')) for x in streams}
            for site in sites:
                if site['domain'] not in hosts:continue
                data=api('https://analyticsdata.googleapis.com/v1beta/'+prop['property']+':runReport',{'dateRanges':[{'startDate':str(previous_start),'endDate':str(end)}],'dimensions':[{'name':'date'}],'metrics':[{'name':'sessions'},{'name':'activeUsers'},{'name':'engagedSessions'}],'limit':1000})
                daily=[{'date':r['dimensionValues'][0]['value'][:4]+'-'+r['dimensionValues'][0]['value'][4:6]+'-'+r['dimensionValues'][0]['value'][6:8],**{key:int(r['metricValues'][i]['value']) for i,key in enumerate(['sessions','activeUsers','engagedSessions'])}} for r in data.get('rows',[])]
                # Users aren't additive across days. Read period totals separately.
                agg=api('https://analyticsdata.googleapis.com/v1beta/'+prop['property']+':runReport',{'dateRanges':[{'startDate':str(start),'endDate':str(end)}],'metrics':[{'name':'sessions'},{'name':'activeUsers'},{'name':'engagedSessions'}]})
                vals=agg.get('rows',[{'metricValues':[{'value':'0'}]*3}])[0]['metricValues']
                site['ga4']={'property':prop['property'],'daily':daily,**{key:int(vals[i]['value']) for i,key in enumerate(['sessions','activeUsers','engagedSessions'])}}
    except Exception as e:errors.append({'source':'GA4','message':str(e)})
    accounts=[]
    def ads_query(cid,q,login=None):
        extra={'developer-token':developer_token}
        if login:extra['login-customer-id']=login
        body={'query':q};results=[]
        while True:
            a=api(f'https://googleads.googleapis.com/v25/customers/{cid}/googleAds:search',body,extra);results+=a.get('results',[])
            if not a.get('nextPageToken'):break
            body['pageToken']=a['nextPageToken']
        return results
    if developer_token:
        try:
            accessible=api('https://googleads.googleapis.com/v25/customers:listAccessibleCustomers',extra={'developer-token':developer_token}).get('resourceNames',[])
            targets=[]
            for resource in accessible:
                cid=resource.split('/')[-1];info=ads_query(cid,'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer')[0]['customer']
                if info.get('manager'):
                    children=ads_query(cid,'SELECT customer_client.id, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.status = ENABLED')
                    targets.extend((str(r['customerClient']['id']),cid) for r in children)
                else:targets.append((cid,None))
            done=set()
            for cid,login in targets:
                if cid in done:continue
                done.add(cid)
                try:
                    info=ads_query(cid,'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer',login)[0]['customer']
                    period=f"segments.date BETWEEN '{previous_start}' AND '{end}'"
                    raw=ads_query(cid,f'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE {period} AND metrics.impressions > 0 ORDER BY segments.date',login)
                    daily=[{'date':r['segments']['date'],'campaignId':r['campaign']['id'],'campaign':r['campaign']['name'],'channel':r['campaign']['advertisingChannelType'],'status':r['campaign']['status'],'clicks':int(r['metrics'].get('clicks',0)),'impressions':int(r['metrics'].get('impressions',0)),'costMicros':int(r['metrics'].get('costMicros',0)),'conversions':float(r['metrics'].get('conversions',0))} for r in raw]
                    actions_raw=ads_query(cid,f'SELECT segments.date, segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM customer WHERE {period}',login)
                    actions=[{'date':r['segments']['date'],'name':r['segments']['conversionActionName'],'conversions':float(r['metrics'].get('conversions',0)),'allConversions':float(r['metrics'].get('allConversions',0))} for r in actions_raw]
                    landing=ads_query(cid,f'SELECT campaign.id, ad_group_ad.ad.final_urls, metrics.cost_micros, metrics.clicks FROM ad_group_ad WHERE {period} AND metrics.impressions > 0',login)
                    campaign_hosts={}
                    for r in landing:
                        campaign_hosts.setdefault(r['campaign']['id'],set()).update(domain(u) for u in r['adGroupAd']['ad'].get('finalUrls',[]))
                    mappings={campaign:next(iter(hosts)) for campaign,hosts in campaign_hosts.items() if len(hosts)==1 and next(iter(hosts)) in seen}
                    unmapped=[campaign for campaign,hosts in campaign_hosts.items() if campaign not in mappings]
                    for row in daily:row['domain']=mappings.get(row['campaignId'])
                    current=[r for r in daily if r['date']>=str(start)]
                    account={'id':cid,'name':info.get('descriptiveName',cid),'currency':info.get('currencyCode',''),'timeZone':info.get('timeZone',''),'daily':daily,'actions':actions,'unmappedCampaigns':unmapped,'costMicros':sum(r['costMicros'] for r in current),'clicks':sum(r['clicks'] for r in current),'impressions':sum(r['impressions'] for r in current),'conversions':sum(r['conversions'] for r in current)}
                    accounts.append(account)
                    for site in sites:
                        matching=[r for r in current if r.get('domain')==site['domain']]
                        if matching:site['ads']={'accountId':cid,'currency':account['currency'],'costMicros':sum(r['costMicros'] for r in matching),'clicks':sum(r['clicks'] for r in matching),'conversions':sum(r['conversions'] for r in matching)}
                except Exception as e:errors.append({'source':'Google Ads','accountId':cid,'message':str(e)})
        except Exception as e:errors.append({'source':'Google Ads','message':str(e)})
    else:errors.append({'source':'Google Ads','message':'本机未配置广告 API 开发者凭据'})
    print('Ads:',len(accounts),'accounts; GA4:',sum(bool(s['ga4']) for s in sites),flush=True)
    out={'checkedAt':now.isoformat(),'period':{'start':str(start),'end':str(end),'previousStart':str(previous_start),'days':28,'timeZone':'Asia/Shanghai'},'sheet':{'title':meta['properties']['title'],'id':SHEET_ID},'sites':sites,'accounts':accounts,'errors':errors,'ga4AccessibleCount':len(ga4_properties)}
    DATA_DIR.mkdir(parents=True,exist_ok=True)
    temp=DATA_DIR/'latest.tmp';temp.write_text(json.dumps(out,ensure_ascii=False,indent=2));temp.chmod(0o600);temp.replace(DATA_DIR/'latest.json')
    return out

if __name__=='__main__':
    result=collect();print('Saved verified snapshot:',len(result['sites']),'sites',result['period']['start'],result['period']['end'],flush=True)
