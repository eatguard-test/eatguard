// EatGuard AI 后端 - 文字识别
// Vercel Serverless Function：POST /api/ai-text
// 1) 优先调用 DeepSeek（deepseek-chat）
// 2) 若 DeepSeek 返回 401/403/429/5xx 或网络异常，自动回退 通义千问 qwen-plus（文本）
// 安全：API Key 仅从环境变量读取（本地 backend/.env 或 Vercel Environment Variables），代码中不存放任何 Key。

const AI_FOOD_PROMPT = [
  "你是一名专业的中国食物营养估算师。请根据输入（图片或文字描述）估算这餐/这份食物的营养成分。",
  "只输出一个 JSON 对象，不要输出任何其他文字。格式如下：",
  '{"name":"食物名称（中文，简洁）","amount":"份量描述（如 1碗 / 200g / 1个）","weight_g":200,"calories_kcal":230,"protein_g":6,"fat_g":1,"carbs_g":48,"confidence":0.85,"notes":"估算依据，一两句话，中文（如：一碗米饭约200g，按常见主食密度估算）"}',
  "规则：1) 数值必须为数字，单位分别是 g、kcal、g；2) 无法确定时按中国常见食物数据估算，并把 confidence 降低到 0.5 以下；3) amount 用中文描述份量；4) notes 必须简洁说明估算依据。",
].join("\n");

// 从 OpenAI 兼容响应中提取 content 并解析 JSON
function extractResult(data) {
  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  if (!content) {
    const err = new Error(
      (data && data.error && (data.error.message || data.error.code)) || "AI 返回为空"
    );
    err.status = 502;
    throw err;
  }
  let c = String(content).trim();
  try { return JSON.parse(c); } catch (e) { /* 继续尝试提取 */ }
  const m = c.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (e2) { /* fallthrough */ }
  }
  const err = new Error("AI 返回内容无法解析为 JSON");
  err.status = 502;
  throw err;
}

// 调用 DeepSeek
async function callDeepSeek(text, apiKey) {
  const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "用户描述：" + text + "\n\n" + AI_FOOD_PROMPT }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  const data = await upstream.json();
  return { ok: upstream.ok, status: upstream.status, data };
}

// 调用 通义千问 qwen-plus（回退）
async function callQwenPlus(text, apiKey) {
  const upstream = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: "qwen-plus",
      messages: [{ role: "user", content: "用户描述：" + text + "\n\n" + AI_FOOD_PROMPT }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  const data = await upstream.json();
  return { ok: upstream.ok, status: upstream.status, data };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const text = (req.body && req.body.text) || "";
  if (!text) return res.status(400).json({ error: "text 不能为空" });

  const dsKey = process.env.DEEPSEEK_API_KEY || "";
  const qwenKey = process.env.DASHSCOPE_API_KEY || "";

  // 1) DeepSeek
  if (dsKey) {
    try {
      const r = await callDeepSeek(text, dsKey);
      if (r.ok) return res.json({ result: extractResult(r.data) });
      // 401/403 = Key 无效；429/5xx = 服务故障 → 均尝试回退
      console.warn("DeepSeek 返回 " + r.status + "，尝试回退 qwen-plus");
    } catch (e) {
      console.warn("DeepSeek 请求异常，尝试回退 qwen-plus:", e.message);
    }
  } else {
    console.warn("未配置 DEEPSEEK_API_KEY，尝试回退 qwen-plus");
  }

  // 2) 回退：通义千问 qwen-plus
  if (!qwenKey) {
    return res.status(500).json({ error: "服务端未配置 DEEPSEEK_API_KEY / DASHSCOPE_API_KEY" });
  }
  try {
    const r = await callQwenPlus(text, qwenKey);
    if (!r.ok) {
      const msg =
        (r.data && r.data.error && (r.data.error.message || r.data.error.code)) ||
        "回退服务错误 " + r.status;
      return res.status(502).json({ error: msg });
    }
    const result = extractResult(r.data);
    result.fallbackEngine = "qwen-plus"; // 标记本次由回退引擎完成
    return res.json({ result });
  } catch (e) {
    console.error("qwen-plus fallback error:", e);
    return res.status(502).json({ error: e.message || "AI 服务暂不可用" });
  }
};
