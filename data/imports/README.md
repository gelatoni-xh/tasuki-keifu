# Import Payloads

这个目录用于存放真实数据导入的 JSON payload。

当前第一版正式入口：

- `tsx scripts/imports/import-race.ts <payload.json>`

建议规则：

- 一个 payload 只对应一个明确的导入批次
- 文件名包含赛事和区间，例如 `hakone-102-leg-1.json`
- 原始抓取文件不要放在这里，放在后续单独的 raw 目录
