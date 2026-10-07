# Ouyee-Dashboard

中文多网站运营看板。采用 TailAdmin 免费版的设计基础、配色和组件样式，遵守 MIT 许可。

- 网站清单：Google Sheets，只读取名称与网址。
- GSC：每日自然搜索点击、展示、点击率、平均排名及默认周期页面明细。
- Google Ads：广告系列、每日花费、点击、展示和转化动作，按目标网址匹配网站。
- GA4：只统计已获得权限并与网站网址匹配的资源；权限不足明确标记。
- 真实询盘：直接读取《官网询盘统计表》的登记工作表，按原始字段匹配网站、获客来源、接收方式和跟进人。原表未标注有效状态时不推断有效客户数量。
- 数据周期：以北京时间计算，默认截至三天前的最近 28 天，保存前 28 天供比较。广告原始日期按各广告账户时区统计；不同账户时区在连接页列明，跨时区不得视为严格同时段。
- 登录保护：服务器签名的 HttpOnly Cookie，谷歌密钥存于 Cloudflare 加密环境变量，数据存储于独立 KV，不进入浏览器构建包。

## 开发

```bash
npm ci
npm run build
npx wrangler pages dev dist --port 8787
```

本地 `.dev.vars` 配置与 Cloudflare 环境变量同名。正式部署：Cloudflare Pages 连接本仓库 main，构建命令 `npm run build`，输出 `dist`。Cloudflare 自动部署每次 main 更新。

环境变量：`DASHBOARD_PASSWORD`、`SESSION_SECRET`、`GOOGLE_SERVICE_ACCOUNT`（完整服务账号 JSON）、`GOOGLE_ADS_DEVELOPER_TOKEN`。KV 绑定：`DASHBOARD_DATA`。

GSC、GA4、Google Ads 由已登录用户点击“刷新数据”重新读取。询盘表在打开看板时自动检查，并在页面可见期间每 5 分钟检查；也支持单独点击“同步询盘”立即强制同步。表格新增、修改、删除后按全量内容重新汇总，不重复追加。读取失败保留上次成功快照并显示错误。关闭看板后没有定时后台任务。

询盘 CSV 表头：询盘编号、登记日期、网站域名、来源渠道、询盘状态、国家、公司、联系人、备注。前五列必填；日期 YYYY-MM-DD；状态 有效/待确认/垃圾。Google Ads 有效询盘成本采用登记渠道为 Google Ads 的有效记录作为分母，不等同于广告归因证明。

已有编号跳过，修改记录需在后续编辑流程中处理，不会静默覆盖。CSV 导出会防止公式被执行。个人用量下 KV 版本校验减少重复导入；如多人同时导入，应迁移为事务数据库。

模板出处：https://github.com/TailAdmin/free-react-tailwind-admin-dashboard

## 动态询盘表

询盘来源：`1YQIJ7jHgiJi0YtXJKMSYhuqhbILwmN38KfTpvTWmW90`。识别具有日期和客户信息表头的登记工作表，排除国家区号、业务员统计、品类及国家占比辅助表。优先按来源 URL 匹配网站；来源为空时采用已核对的工作表对应关系；未知网址不强行归属。WhatsApp 共用登记保留在欧野组，可用 `LEADS_WHATSAPP_DOMAIN` 指定统一归属（仅在得到确认时配置）。

原表的 SEM / Google Ads 计入 Google Ads 登记，SEO 计入自然搜索。WhatsApp 是接收方式，未标明获客来源时保留未知；“广告”但未注明平台不视为 Google Ads。未填写日期的登记只在全部历史视图展示；辅助空行不计数。邮件 ID 或同表完全相同的登记用于去重；不把同一客户的不同询盘自动合并。

客户端可查看与总览同周期、截至今天最近 28 天、全部历史登记，支持来源/状态/客户搜索和分页。广告登记成本只在登记日期有完整广告报表覆盖且单一货币时计算；这不是有效客户成本或归因证明。

验证：`node tests/leads.mjs`、`node tests/sheet-leads.mjs`、`npm run build`。
