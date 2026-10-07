// Apply the saved appearance before the app paints; CSP permits this local script.
(()=>{let saved;try{saved=localStorage.getItem('ouyee-dashboard-theme')}catch{}const theme=saved==='light'||saved==='dark'?saved:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme})();
