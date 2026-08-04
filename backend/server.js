// EatGuard AI 后端 - 本地开发服务器
// 启动：npm install && npm start  →  http://localhost:3000
// 线上：Vercel 直接部署本目录，api/ 下的函数自动映射为 /api/ai-text、/api/ai-image
// 安全：Key 只从 .env 读取（.env 已被 .gitignore 忽略，绝不提交）。
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const aiText = require("./api/ai-text");
const aiImage = require("./api/ai-image");

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" })); // 图片 base64 可能较大

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    deepseek: !!process.env.DEEPSEEK_API_KEY,
    dashscope: !!process.env.DASHSCOPE_API_KEY,
  });
});

app.post("/api/ai-text", aiText);
app.post("/api/ai-image", aiImage);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`EatGuard AI backend listening on http://localhost:${PORT}`);
  console.log(`DeepSeek key: ${process.env.DEEPSEEK_API_KEY ? "已配置" : "未配置"}`);
  console.log(`DashScope key: ${process.env.DASHSCOPE_API_KEY ? "已配置" : "未配置"}`);
});
