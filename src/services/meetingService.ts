import { AgentConfig, AgentRole, Message, MeetingState, TodoItem } from "../types";
import { callQwen } from "./llm";
import { MemoryMatrix, constructPromptWithMemory } from "./memoryService";

export async function runStage1(topic: string, agents: AgentConfig[], leadAgentRole: AgentRole, memory: MemoryMatrix) {
  const leadAgent = agents.find(a => a.role === leadAgentRole) || agents[0];
  const basePrompt = `你是智议平台的${leadAgent.title}。当前会议主题是"${topic}"。
作为本环节的主责人，请根据你的岗位职责（${leadAgent.responsibilities.join('，')}）和专业技能（${leadAgent.skills.join('，')}），
提出一份初步的方案草案。请使用Markdown格式输出。`;
  
  const prompt = constructPromptWithMemory(basePrompt, memory);
  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  return { content, usage };
}

export async function initializeAgentsByIndustry(industry: string, agents: AgentConfig[]) {
  const prompt = `请根据行业"${industry}"，为以下岗位初始化其行业技能、职责范围和关注点。
岗位列表：${agents.map(a => a.title).join('、')}

请严格按照以下JSON数组格式返回，每个对象包含role(AgentRole枚举值), skills(数组), responsibilities(数组), focusPoints(数组)：
[
  {"role": "CEO", "skills": ["..."], "responsibilities": ["..."], "focusPoints": ["..."]},
  ...
]`;

  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  try {
    const jsonStr = content.match(/\[[\s\S]*\]/)?.[0] || content;
    return { data: JSON.parse(jsonStr), usage };
  } catch (e) {
    return { data: [], usage };
  }
}

export async function runStage2(topic: string, currentDraft: string, agents: AgentConfig[], memory: MemoryMatrix) {
  const critiques: { role: AgentRole; name: string; content: string }[] = [];
  const critiquingRoles = [AgentRole.COO, AgentRole.CPO, AgentRole.CPO_PURCHASE, AgentRole.CTO];
  let totalUsage = 0;
  
  for (const role of critiquingRoles) {
    const agent = agents.find(a => a.role === role);
    if (!agent) continue;

    const basePrompt = `你是智议平台的${agent.title}。当前会议主题是"${topic}"。
主责人已提出方案草案：\n\n${currentDraft}\n\n
请进入“深度评审”模式。作为相关职能负责人，你必须主动响应并思考与你职责（${agent.responsibilities.join('，')}）相关的问题。
**强制要求：**
1. 严禁“放空”或给出空泛的回复。
2. 你必须提出至少 **3个** 与你职责相关的具体问题、潜在风险或尚未细化的细节。
3. 针对你提出的每个问题，必须同时给出初步的 **解决方案**。
4. 请使用结构化的列表形式输出。`;
    
    const prompt = constructPromptWithMemory(basePrompt, memory);
    const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
    totalUsage += usage;
    critiques.push({ role, name: agent.title, content });
  }
  
  return { critiques, usage: totalUsage };
}

export async function moderatorSummarizeTodos(topic: string, draft: string, critiques: string[], agents: AgentConfig[]) {
  const validRoles = agents.map(a => a.role).join('、');
  const prompt = `你是会议主持人。请根据主责人的方案草案和各部门的质疑，总结出一份“待处理问题清单”。
主题：${topic}
草案：${draft}
质疑记录：\n${critiques.join('\n')}

请列出所有需要解决的具体问题，并指定最适合解决该问题的Agent角色，以及该问题影响的产出物名称。
**可选角色必须是以下之一：${validRoles}**

请严格按照以下JSON数组格式返回：
[
  {"content": "问题描述", "assignee": "角色名称", "impactedOutput": "受影响的产出物名称"},
  ...
]`;

  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  try {
    const jsonStr = content.match(/\[[\s\S]*\]/)?.[0] || content;
    return { data: JSON.parse(jsonStr), usage };
  } catch (e) {
    return { data: [], usage };
  }
}

export async function agentSolveTodo(topic: string, todoContent: string, agentRole: string, agents: AgentConfig[], memory: MemoryMatrix) {
  const agent = agents.find(a => a.role === agentRole || a.title.includes(agentRole)) || agents[0];
  const basePrompt = `你是智议平台的${agent.title}。主持人点名要求你解决以下待办问题：
问题：${todoContent}
会议主题：${topic}

请根据你的专业背景给出具体的解决方案或回复。`;

  const prompt = constructPromptWithMemory(basePrompt, memory);
  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  return { content, usage };
}

export async function agentDiscussTodo(topic: string, todoContent: string, solution: string, agentRole: AgentRole, agents: AgentConfig[], memory: MemoryMatrix) {
  const agent = agents.find(a => a.role === agentRole) || agents[0];
  const basePrompt = `你是智议平台的${agent.title}。当前正在讨论主题"${topic}"下的一个待办项。
待办问题：${todoContent}
责任方提出的解决方案：\n${solution}\n
请根据你的专业背景对该方案进行点评、补充或提出异议。请保持专业且简洁。`;

  const prompt = constructPromptWithMemory(basePrompt, memory);
  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  return { content, usage };
}

export async function moderatorFinalizeTodo(todoContent: string, discussion: string) {
  const prompt = `你是会议主持人。请根据以下关于待办项的讨论，给出最终决议。
待办问题：${todoContent}
讨论记录：\n${discussion}\n

你需要判断：
1. 该问题是否已得到明确解决（confirmed）？
2. 该解决方案是属于“CEO方案的补充（supplement）”还是“对应节点的细化方案（detail）”？

请严格按照以下JSON格式返回：
{
  "status": "confirmed" | "pending",
  "type": "supplement" | "detail",
  "finalContent": "最终确定的方案内容(Markdown)",
  "reason": "决议理由"
}`;

  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  try {
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    return { data: JSON.parse(jsonStr), usage };
  } catch (e) {
    return { data: { status: "pending", type: "detail", finalContent: "", reason: "解析失败" }, usage };
  }
}

export async function moderatorCheckResolution(todos: TodoItem[], lastDiscussion: string) {
  const prompt = `你是会议主持人。请判断以下待办问题是否已通过最近的讨论得到解决。
待办列表：\n${todos.map(t => `- ${t.content} (负责人: ${t.assignee})`).join('\n')}
最近讨论：\n${lastDiscussion}

请返回哪些问题已解决，哪些仍需讨论。
请严格按照以下JSON格式返回：
{
  "resolvedIds": ["已解决的待办ID"],
  "remainingTodos": ["未解决的待办内容描述"],
  "allCleared": boolean
}`;

  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  try {
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    return { data: JSON.parse(jsonStr), usage };
  } catch (e) {
    return { data: { resolvedIds: [], remainingTodos: [], allCleared: false }, usage };
  }
}

export async function getExpertScore(topic: string, draft: string, critiques: string[], isCEOStage: boolean) {
  const prompt = `你是智议平台的专家顾问。请对以下方案及讨论进行评分（0-100）。
主题：${topic}
方案：\n${draft}
讨论记录：\n${critiques.join('\n')}

${isCEOStage ? "当前是CEO整体方案评估阶段。请重点评估：问题是否都有明确解法，不展开细节说明。细节应体现在后续节点中。" : "当前是节点细化方案评估阶段。请根据CEO整体方案的规则评判该方案是否合理。"}

请严格按照以下JSON格式返回：
{
  "score": number,
  "feedback": "string",
  "todos": ["string"]
}`;

  const { content, usage } = await callQwen([{ role: "user", content: prompt }]);
  try {
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    return { data: JSON.parse(jsonStr), usage };
  } catch (e) {
    return { data: { score: 75, feedback: "评分解析失败", todos: [] }, usage };
  }
}

export async function moderatorSummarizeMeeting(participants: string[], content: string, todos: TodoItem[]) {
  const prompt = `请作为会议主持人，总结当前节点的会议纪要。
参会人员：${participants.join('、')}
会议内容：${content}
待办事项：${JSON.stringify(todos)}

请严格按照以下格式输出Markdown：
# 会议纪要
## 会议人员
...
## 会议内容
...
## TODO
| TODO事项描述 | 责任人 | 影响产出物 |
| --- | --- | --- |
...`;

  const { content: summary, usage } = await callQwen([{ role: "user", content: prompt }]);
  return { content: summary, usage };
}
