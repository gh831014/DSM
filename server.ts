import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const KB_DIR = path.join(process.cwd(), "knowledge_base");
if (!fs.existsSync(KB_DIR)) {
  fs.mkdirSync(KB_DIR);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Knowledge Base APIs
  app.get("/api/kb/:industry", (req, res) => {
    const { industry } = req.params;
    const filePath = path.join(KB_DIR, `${industry}.md`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const stats = fs.statSync(filePath);
      res.json({ exists: true, content, lastUpdated: stats.mtime });
    } else {
      res.json({ exists: false });
    }
  });

  app.post("/api/kb/:industry", (req, res) => {
    const { industry } = req.params;
    const { content } = req.body;
    const filePath = path.join(KB_DIR, `${industry}.md`);
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to save KB", details: error.message });
    }
  });

  // Token Log API
  // Agent Config APIs
  app.post("/api/agent-config", (req, res) => {
    const { industry, agents } = req.body;
    const filePath = path.join(KB_DIR, `${industry}_agents.md`);
    
    let content = `# ${industry} 行业 Agent 配置\n\n`;
    agents.forEach((agent: any) => {
      content += `## ${agent.title} (${agent.role})\n`;
      content += `### 行业技能\n${agent.skills.map((s: string) => `- ${s}`).join('\n')}\n\n`;
      content += `### 职责范围\n${agent.responsibilities.map((r: string) => `- ${r}`).join('\n')}\n\n`;
      content += `### 关注点\n${agent.focusPoints.map((f: string) => `- ${f}`).join('\n')}\n\n`;
      content += `---\n\n`;
    });

    fs.writeFileSync(filePath, content, "utf-8");
    res.json({ success: true, path: filePath });
  });

  app.post("/api/token-log", (req, res) => {
    const { log } = req.body;
    const filePath = path.join(process.cwd(), "token_usage.md");
    try {
      let content = "";
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, "utf-8");
      } else {
        content = "# Token 使用记录\n\n| 日期 | 讨论主题 | 消耗量 |\n| --- | --- | --- |\n";
      }
      
      const logLine = `| ${log.date} | ${log.discussion} | ${log.consumption} |\n`;
      content += logLine;
      
      // Calculate total
      const lines = content.split("\n");
      let total = 0;
      lines.forEach(line => {
        const parts = line.split("|");
        if (parts.length >= 4) {
          const val = parseInt(parts[3].trim());
          if (!isNaN(val)) total += val;
        }
      });
      
      // Update total in header or footer? Let's just append a total line if it doesn't exist or update it.
      // Better: keep it simple, just append. The UI will calculate the total from the state anyway.
      
      fs.writeFileSync(filePath, content, "utf-8");
      res.json({ success: true, total });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to save token log", details: error.message });
    }
  });

  // Qwen API Proxy (Code Planning Parameters)
  app.post("/api/llm/qwen", async (req, res) => {
    try {
      const { messages, model = "qwen3.5-plus" } = req.body;
      
      // Using OpenAI-compatible endpoint as suggested by "Base URL: .../v1"
      const response = await axios.post(
        "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
        {
          model: model,
          messages: messages
        },
        {
          headers: {
            "Authorization": `Bearer ${process.env.QWEN_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      res.json(response.data);
    } catch (error: any) {
      console.error("Qwen API Error Details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
      res.status(error.response?.status || 500).json({ 
        error: "Failed to call Qwen API",
        details: error.response?.data || error.message
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
