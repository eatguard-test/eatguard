# EatGuard AI 后端

转发 AI 识别请求，**API Key 只存在于环境变量**（本地 `.env` / Vercel Environment Variables），代码和 Git 仓库中不包含任何 Key。

| 接口 | 用途 | 引擎 | 回退 |
|------|------|------|------|
| `POST /api/ai-text` | 文字描述识别 | DeepSeek `deepseek-chat` | 503/401/429 时自动回退通义千问 `qwen-plus` |
| `POST /api/ai-image` | 拍照识别 | 通义千问 `qwen-vl-plus` | — |
| `GET /api/health` | 健康检查 | — | — |

## 本地开发

```bash
cd backend
npm install
cp .env.example .env     # 填入真实 Key（.env 不会提交）
npm start                # http://localhost:3000
```

前端（eatguard）设置页 → AI 识别 → 后端服务地址填 `http://localhost:3000`。

## 部署到 Vercel（免费）

```bash
cd backend
npm i -g vercel
vercel                  # 首次部署：选择/创建项目
vercel env add DEEPSEEK_API_KEY production     # 粘贴你的 DeepSeek Key
vercel env add DASHSCOPE_API_KEY production    # 粘贴你的通义千问 Key
vercel --prod
```

部署完成后得到 `https://<项目名>.vercel.app`，在 eatguard 设置页后端地址填入该域名即可。

## 安全说明

- `.env` 已被 `.gitignore` 忽略，**绝不会提交**；线上 Key 只放 Vercel Environment Variables。
- 前端（eatguard）代码中不包含任何 API Key 或直连 AI 的调用，全部经本后端转发。
