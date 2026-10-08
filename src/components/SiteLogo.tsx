import {useState} from 'react';
import {Globe2} from 'lucide-react';
import logos from '../../public/site-logos/manifest.json';
const manifest=logos as Record<string,{icon:string|null;brand:string|null;fallback?:string}>;
export function SiteLogo({domain,brand=false,className=''}:{domain:string;brand?:boolean;className?:string}){const [failed,setFailed]=useState(false);const item=manifest[domain],source=brand?item?.brand:item?.icon;return <span className={`site-logo ${brand?'wordmark':''} ${className}`} title={item?.fallback?domain+' · '+item.fallback:domain}>{source&&!failed?<img src={source} alt={`${domain} Logo`} loading={brand?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>:<Globe2 size={18} aria-label="网站标识暂不可用"/>}</span>}
