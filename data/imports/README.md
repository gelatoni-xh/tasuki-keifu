# Import Payloads

这个目录用于存放真实数据导入的 JSON payload。

当前第一版正式入口：

- `tsx scripts/imports/import-race.ts <payload.json>`

建议规则：

- 一个 payload 只对应一个明确的导入批次
- 文件名包含赛事和区间，例如 `hakone-102-leg-1.json`
- 原始抓取文件不要放在这里，放在后续单独的 raw 目录

提交边界：

- `*.json` 是正式导入 payload，可以纳入版本控制
- `*.draft.json` 是生成过程中的草稿文件，只用于本地检查，不纳入版本控制
- 一次性排查、修补、试验性质的数据文件应放到 `local/` 或其他被忽略的本地目录，不放在这里
