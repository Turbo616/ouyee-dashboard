import {useState} from 'react';
import {Moon,Sun} from 'lucide-react';
export function ThemeToggle(){
 const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark');
 function toggle(){const next=dark?'light':'dark';document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;try{localStorage.setItem('ouyee-dashboard-theme',next)}catch{}setDark(!dark)}
 const label=dark?'切换到白天模式':'切换到黑夜模式';
 return <button type="button" className="theme-toggle" aria-label={label} aria-pressed={dark} title={label} onClick={toggle}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>
}
