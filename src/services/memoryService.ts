import { Message, TodoItem, AgentConfig } from "../types";

export interface MemoryMatrix {
  instant: Message[];
  transactional: {
    todos: TodoItem[];
    decisions: string[];
  };
  entityLabels: {
    agents: AgentConfig[];
    industryKnowledge: string[];
  };
}

export function constructPromptWithMemory(basePrompt: string, memory: MemoryMatrix) {
  const recentHistory = memory.instant.slice(-10).map(m => `${m.senderName}: ${m.content}`).join('\n');
  const activeTodos = memory.transactional.todos.filter(t => t.status === 'pending').map(t => `- [ ] ${t.content} (@${t.assignee})`).join('\n');
  const decisions = memory.transactional.decisions.map(d => `- ${d}`).join('\n');
  const industryInfo = memory.entityLabels.industryKnowledge.join('；');

  return `
背景信息：
[行业知识]：${industryInfo}
[近期讨论]：
${recentHistory}

[待办事项]：
${activeTodos}

[已达成共识]：
${decisions}

---
指令：
${basePrompt}
`;
}
