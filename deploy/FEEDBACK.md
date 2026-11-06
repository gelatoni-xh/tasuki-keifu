# 用户反馈

右下角的襷带精灵在五种语言页面显示，点击打开反馈表单。支持数据纠错、数据补充愿望、网站问题与建议。无需登录；只有说明必填，来源、相关页面、邮箱选填。当前页面路径自动附带，不采集查询参数。

## Ubuntu-3 配置

复用现有 163 SMTP 账号，在 Ubuntu-3 的受保护 `.env.production` 中设置 `.env.production.example` 所列的 `FEEDBACK_*` 变量。账号值从现有受保护的 mail.json/163-smtp.json 读取，不提交到 Git、不输出到日志。配置文件权限保持 600。

- `FEEDBACK_SMTP_HOST=smtp.163.com`，`FEEDBACK_SMTP_PORT=465`：TLS 连接，校验证书。
- `FEEDBACK_SMTP_USER`、`FEEDBACK_SMTP_PASSWORD`：163 邮箱账号和 SMTP 授权码。
- `FEEDBACK_MAIL_FROM`、`FEEDBACK_MAIL_TO`：固定发件人和维护者收件地址。用户邮箱只作为 Reply-To。
- `FEEDBACK_RATE_LIMIT_SECRET`：随机秘密（例如 `openssl rand -hex 32`），用于对来源 IP 做 HMAC；数据库不保存原始 IP。
- `NEXT_PUBLIC_SITE_URL` 必须为正式站点 origin，生产 API 按此校验 Origin。

按现有部署流程执行 `prisma migrate deploy` 后启动新镜像。只新增 `UserFeedback` 表。邮件从 Ubuntu-3 直接发送，不依赖 Ubuntu-4；需允许主机出站 TCP 465。Nginx 必须覆盖 `X-Real-IP`，应用端口保持仅绑定 loopback（现有部署已满足）。

本次开发未修改服务器配置、未部署、未发送真实邮件。

## 存储和通知

`payload` 保存反馈字段和页面上下文；其他字段记录提交 UUID、提交时间、限流哈希及邮件通知状态。没有后台页面或反馈处理工作流。

先提交数据库事务，再等待有超时限制的 SMTP 发送。邮件失败仍向用户确认反馈已保存，通知状态记为 `failed`。重复提交相同 UUID 与内容只保存一条并仅通知一次；同 UUID 不同内容拒绝。每来源 10 分钟 5 条、全站每小时 100 条；数据库锁使多进程行为一致。

邮件状态：`pending`（待发送）、`sending`（发送中）、`sent`（已发送）、`failed`（失败）。可直接查表查看原始反馈：

```sql
SELECT id, "createdAt", payload, "notificationStatus", "notificationLastError"
FROM "UserFeedback" ORDER BY "createdAt" DESC LIMIT 50;
```

在 app 容器中重试某条失败或待发通知（沿用容器环境变量）：

```sh
pnpm exec tsx deploy/retry-feedback.ts <feedback-id>
```

若进程在发送中中断，状态可能停在 `sending`。先确认原发送进程已退出，再附加 `--recover-interrupted` 重试。SMTP 和数据库无法保证跨系统恰好一次，恢复中断发送可能产生重复邮件，应先查收件箱。成功邮件默认不会重发。

反馈包含非公开内容和可选邮箱，查询结果、数据库备份也应按私人资料保护。Prisma 日志屏蔽反馈 SQL 参数，邮件错误仅保存错误代码。暂不设置自动删除期限。

## 验证

在独立 PostgreSQL 17 数据库（数据库名 `feedback_test`）先执行迁移，再运行：

```sh
DATABASE_URL='postgresql://postgres:feedback_test@127.0.0.1:15439/feedback_test' NODE_ENV=test pnpm exec tsx --test tests/feedback.integration.test.ts
```

此测试清空测试库的反馈表，使用本地 SMTP 接收器，验证并发幂等、真实 SMTP 协议发送、失败落库及重试、输入校验、跨域拦截、大小限制和限流。不会使用真实邮箱。
