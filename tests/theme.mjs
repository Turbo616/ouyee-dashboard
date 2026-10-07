import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../public/theme.js',import.meta.url),'utf8');
function boot(saved,systemDark=false,blocked=false){const root={dataset:{},style:{}};vm.runInNewContext(script,{document:{documentElement:root},localStorage:{getItem(){if(blocked)throw Error('unavailable');return saved}},matchMedia:()=>({matches:systemDark})});return root}
assert.equal(boot('dark').dataset.theme,'dark');assert.equal(boot('light',true).dataset.theme,'light');assert.equal(boot(null,true).dataset.theme,'dark');assert.equal(boot(null,false).dataset.theme,'light');assert.equal(boot('invalid',true).dataset.theme,'dark');assert.equal(boot(null,true,true).style.colorScheme,'dark');
console.log('Theme boot: saved preference, system default, invalid preference and blocked storage passed');
