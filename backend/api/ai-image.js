// EatGuard AI 后端 - 拍照识别
// Vercel Serverless Function：POST /api/ai-image
// 调用 通义千问 Qwen-VL（DashScope 兼容模式），content 数组：text 在前、image_url 在后
// 安全：API Key 仅从环境变量读取（本地 backend/.env 或 Vercel Environment Variables），代码中不存放任何 Key。

const AI_FOOD_PROMPT = [
  "你是一名专业的中国食物营养估算师。请根据输入（图片或文字描述）估算这餐/这份食物的营养成分。",
  "只输出一个 JSON 对象，不要输出任何其他文字。格式如下：",
  '{"name":"食物名称（中文，简洁）","amount":"份量描述（如 1碗 / 200g / 1个）","weight_g":200,"calories_kcal":230,"protein_g":6,"fat_g":1,"carbs_g":48,"confidence":0.85,"notes":"估算依据，一两句话，中文（如：一碗米饭约200g，按常见主食密度估算）"}',
  "规则：1) 数值必须为数字，单位分别是 g、kcal、g；2) 无法确定时按中国常见食物数据估算，并把 confidence 降低到 0.5 以下；3) amount 用中文描述份量；4) notes 必须简洁说明估算依据。",
].join("\n");

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const image = (req.body && req.body.image) || "";
  if (!image) return res.status(400).json({ error: "image 不能为空" });

  const key = process.env.DASHSCOPE_API_KEY || "";
  if (!key) {
    return res.status(500).json({ error: "服务端未配置 DASHSCOPE_API_KEY" });
  }

  try {
    const upstream = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: "qwen-vl-plus",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: AI_FOOD_PROMPT },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      const msg =
        (data && data.error && (data.error.message || data.error.code)) ||
        "DashScope 上游错误 " + upstream.status;
      return res.status(502).json({ error: msg });
    }
    return res.json({ result: extractResult(data) });
  } catch (e) {
    console.error("/api/ai-image error:", e);
    return res.status(500).json({ error: e.message || "服务器内部错误" });
  }
};
