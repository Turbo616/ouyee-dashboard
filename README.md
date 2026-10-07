# Ouyee-Dashboard

中文多网站运营看板。采用 TailAdmin 免费版的设计基础、配色和组件样式，遵守 MIT 许可。

- 网站清单：Google Sheets，只读取名称与网址。
- GSC：每日自然搜索点击、展示、点击率、平均排名及默认周期页面明细。
- Google Ads：广告系列、每日花费、点击、展示和转化动作，按目标网址匹配网站。
- GA4：只统计已获得权限并与网站网址匹配的资源；权限不足明确标记。
- 真实询盘：CSV 预览、校验、按询盘编号去重、确认导入、有效状态统计。没有登记数据时显示待接入。
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

刷新数据由已登录用户点击“刷新数据”触发，当前没有设置定时同步。账号权限变化后需重新刷新。失败时保留旧快照并显示错误。

询盘 CSV 表头：询盘编号、登记日期、网站域名、来源渠道、询盘状态、国家、公司、联系人、备注。前五列必填；日期 YYYY-MM-DD；状态 有效/待确认/垃圾。Google Ads 有效询盘成本采用登记渠道为 Google Ads 的有效记录作为分母，不等同于广告归因证明。

已有编号跳过，修改记录需在后续编辑流程中处理，不会静默覆盖。CSV 导出会防止公式被执行。个人用量下 KV 版本校验减少重复导入；如多人同时导入，应迁移为事务数据库。

模板出处：https://github.com/TailAdmin/free-react-tailwind-admin-dashboard
