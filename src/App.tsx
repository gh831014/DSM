import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  MessageSquare, 
  FileText, 
  Settings, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Send,
  User,
  Brain,
  ShieldCheck,
  TrendingUp,
  ChevronRight,
  Download,
  Upload,
  Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { AgentRole, Message, TodoItem, MeetingState, AgentConfig, ProcessNode, Industry } from './types';
import { DEFAULT_AGENTS, PROCESS_NODES, INDUSTRY_KNOWLEDGE } from './constants';
import { callQwen } from './services/llm';
import { 
  runStage1, 
  runStage2, 
  getExpertScore,
  moderatorSummarizeTodos,
  agentSolveTodo,
  agentDiscussTodo,
  moderatorFinalizeTodo,
  moderatorCheckResolution,
  initializeAgentsByIndustry,
  moderatorSummarizeMeeting
} from './services/meetingService';
import { constructPromptWithMemory } from './services/memoryService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [state, setState] = useState<MeetingState>({
    currentNodeId: 1,
    currentStage: 1,
    messages: [],
    todos: [],
    outputs: {},
    score: { expert: 0, ceo: 0 },
    industry: Industry.PHARMA,
    totalTokens: 0,
    tokenLogs: []
  });

  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS);
  const [nodes, setNodes] = useState<ProcessNode[]>(PROCESS_NODES);
  const [inputText, setInputText] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'outputs' | 'todos'>('chat');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);

  const isMeetingActive = state.messages.some(m => m.type === 'chat');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Knowledge Base Management
  useEffect(() => {
    const manageKB = async () => {
      try {
        // Clear previous KB messages if any, but keep chat messages if we want to allow switching mid-chat?
        // Actually, v1.3 says "allow changing industry", usually implies a fresh start for the new industry.
        if (isMeetingActive) return; // Don't auto-load KB if meeting is already active (user should reset first)

        const response = await fetch(`/api/kb/${state.industry}`);
        const data = await response.json();

        if (data.exists) {
          // ... (existing logic)
          const lastUpdated = new Date(data.lastUpdated);
          const now = new Date();
          const diffDays = (now.getTime() - lastUpdated.getTime()) / (1000 * 3600 * 24);

          if (diffDays > 1) {
            addMessage({
              senderId: "system",
              senderName: "系统",
              senderRole: AgentRole.MODERATOR,
              content: `正在检查 **${state.industry}** 行业知识库更新...`,
              type: 'system'
            });
            setTimeout(() => {
              setState(prev => ({ ...prev, industryKB: data.content }));
              addMessage({
                senderId: "system",
                senderName: "系统",
                senderRole: AgentRole.MODERATOR,
                content: `**${state.industry}** 行业知识库已是最新，挂载成功。`,
                type: 'system'
              });
            }, 1500);
          } else {
            setState(prev => ({ ...prev, industryKB: data.content }));
            addMessage({
              senderId: "system",
              senderName: "系统",
              senderRole: AgentRole.MODERATOR,
              content: `已成功挂载现有 **${state.industry}** 行业知识库。`,
              type: 'system'
            });
          }
        } else {
          // ... (existing generation logic)
          addMessage({
            senderId: "system",
            senderName: "系统",
            senderRole: AgentRole.MODERATOR,
            content: `未检测到 **${state.industry}** 行业知识库，正在现场生成中，请稍候...`,
            type: 'system'
          });
          setIsProcessing(true);

          const prompt = `请为 **${state.industry}** 行业生成一份详细的行业知识库。
内容必须包括：
1. 行业通识 (General Knowledge)
2. 行业规范 (Industry Regulations)
3. 行业准则 (Industry Standards)
4. 行业痛点 (Industry Pain Points)

请使用 Markdown 格式输出，结构清晰，内容专业且具有实操性。`;

          const { content: kbContent, usage: kbUsage } = await callQwen([{ role: "user", content: prompt }]);
          await updateTokens(kbUsage, `生成 ${state.industry} 行业知识库`);
          
          await fetch(`/api/kb/${state.industry}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: kbContent })
          });

          setState(prev => ({ ...prev, industryKB: kbContent }));
          addMessage({
            senderId: "system",
            senderName: "系统",
            senderRole: AgentRole.MODERATOR,
            content: `**${state.industry}** 行业知识库生成并保存成功，已完成实时挂载。`,
            type: 'system'
          });
          setIsProcessing(false);
        }
      } catch (error) {
        console.error("KB Management Error:", error);
      }
    };

    manageKB();
  }, [state.industry]);

  const handleReset = () => {
    if (confirm("确定要终止当前讨论并重开吗？所有未保存的对话将丢失。")) {
      stopRef.current = true;
      setState({
        currentNodeId: 1,
        currentStage: 1,
        messages: [],
        todos: [],
        outputs: {},
        score: { expert: 0, ceo: 0 },
        industry: state.industry,
        industryKB: state.industryKB,
        isHeartbeatActive: false,
        currentActiveAgent: undefined,
        totalTokens: state.totalTokens,
        tokenLogs: state.tokenLogs
      });
      setTopicInput("");
      setIsProcessing(false);
    }
  };

  const addMessage = (msg: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...msg,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    };
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage]
    }));
    return newMessage;
  };

  const updateTokens = async (usage: number, discussion: string) => {
    const log = {
      date: new Date().toLocaleString(),
      discussion,
      consumption: usage
    };
    
    setState(prev => ({
      ...prev,
      totalTokens: prev.totalTokens + usage,
      tokenLogs: [...prev.tokenLogs, log]
    }));

    await fetch('/api/token-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log })
    });
  };

  // Agent Initialization by Industry
  useEffect(() => {
    const initAgents = async () => {
      if (isMeetingActive) return;
      setIsProcessing(true);
      const { data, usage } = await initializeAgentsByIndustry(state.industry, agents);
      await updateTokens(usage, `初始化 ${state.industry} 行业岗位配置`);
      
      if (data && data.length > 0) {
        const updatedAgents = agents.map(agent => {
          const match = data.find((d: any) => d.role === agent.role || d.role === agent.id.toUpperCase());
          if (match) {
            return {
              ...agent,
              skills: match.skills || agent.skills,
              responsibilities: match.responsibilities || agent.responsibilities,
              focusPoints: match.focusPoints || agent.focusPoints,
              mdContent: `# ${agent.title} 岗位说明书 (${state.industry})\n\n## 行业技能\n- ${match.skills?.join('\n- ')}\n\n## 职责范围\n- ${match.responsibilities?.join('\n- ')}\n\n## 关注点\n- ${match.focusPoints?.join('\n- ')}`
            };
          }
          return agent;
        });
        setAgents(updatedAgents);
        
        // Save to MD
        await fetch('/api/agent-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ industry: state.industry, agents: updatedAgents })
        });
      }
      setIsProcessing(false);
    };
    initAgents();
  }, [state.industry]);

  const downloadMD = (name: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStart = async () => {
    if (isMeetingActive && state.currentStage !== 1) return;
    
    if (!topicInput.trim()) {
      alert("请输入讨论主题");
      return;
    }
    
    setIsProcessing(true);
    stopRef.current = false;
    const topic = topicInput;
    const currentNode = nodes[state.currentNodeId - 1];
    
    addMessage({
      senderId: "moderator",
      senderName: "主持人",
      senderRole: AgentRole.MODERATOR,
      content: `会议开始/继续。
**当前节点**：${currentNode.title}
**主责人**：${currentNode.leadAgent}

请主责人给出当前节点的产出物初稿。`,
      type: 'system'
    });

    try {
      let currentDraft = "";
      let isNodeCompleted = false;
      let roundCount = 1;

      while (!isNodeCompleted && !stopRef.current) {
        const memory = {
          instant: state.messages,
          transactional: {
            todos: state.todos,
            decisions: Object.keys(state.outputs)
          },
          entityLabels: {
            agents: agents,
            industryKnowledge: INDUSTRY_KNOWLEDGE[state.industry as Industry] || []
          }
        };

        // 1. Lead Agent Draft
        if (roundCount === 1) {
          const leadAgentRole = currentNode.leadAgent;
          setState(prev => ({ ...prev, currentActiveAgent: leadAgentRole }));
          
          const { content: draft, usage } = await runStage1(topic, agents, leadAgentRole, memory);
          await updateTokens(usage, `[${currentNode.title}] 第${roundCount}轮 方案初稿生成`);
          if (stopRef.current) return;
          
          currentDraft = draft;
          const leadAgent = agents.find(a => a.role === leadAgentRole) || agents[0];
          addMessage({
            senderId: leadAgent.id,
            senderName: leadAgent.title,
            senderRole: leadAgent.role,
            content: draft,
            type: 'chat',
            stage: 1
          });
        }

        // 2. Roundtable
        addMessage({
          senderId: "moderator",
          senderName: "主持人",
          senderRole: AgentRole.MODERATOR,
          content: `第${roundCount}轮深度评审环节开始。请各部门负责人针对职责提出风险点及解决方案。`,
          type: 'system'
        });

        const { critiques, usage: stage2Usage } = await runStage2(topic, currentDraft, agents, memory);
        await updateTokens(stage2Usage, `[${currentNode.title}] 第${roundCount}轮 深度评审`);
        if (stopRef.current) return;

        for (const critique of critiques) {
          addMessage({
            senderId: critique.role,
            senderName: critique.name,
            senderRole: critique.role,
            content: critique.content,
            type: 'chat',
            stage: 2
          });
        }

        // 3. Summarize To-Dos
        const { data: rawTodos, usage: todoUsage } = await moderatorSummarizeTodos(topic, currentDraft, critiques.map(c => c.content), agents);
        await updateTokens(todoUsage, `[${currentNode.title}] 第${roundCount}轮 待办总结`);
        if (stopRef.current) return;
        
        const newTodos: TodoItem[] = rawTodos.map((t: any, i: number) => ({
          id: `todo-${Date.now()}-${i}`,
          content: t.content,
          assignee: t.assignee,
          impactedOutput: t.impactedOutput,
          status: 'pending'
        }));

        setState(prev => ({ ...prev, todos: [...prev.todos, ...newTodos] }));

        // 4. Resolve To-Dos
        setState(prev => ({ ...prev, isHeartbeatActive: true }));
        for (let i = 0; i < newTodos.length; i++) {
          if (stopRef.current) break;
          const todo = newTodos[i];
          
          addMessage({
            senderId: "moderator",
            senderName: "主持人",
            senderRole: AgentRole.MODERATOR,
            content: `【待办处理】讨论问题："${todo.content}"`,
            type: 'system'
          });

          // Assignee responds
          setState(prev => ({ ...prev, currentActiveAgent: todo.assignee }));
          const { content: solution, usage: solveUsage } = await agentSolveTodo(topic, todo.content, todo.assignee, agents, memory);
          await updateTokens(solveUsage, `解决待办: ${todo.content}`);
          if (stopRef.current) break;
          
          addMessage({
            senderId: todo.assignee,
            senderName: todo.assignee,
            senderRole: todo.assignee as AgentRole,
            content: solution,
            type: 'chat'
          });

          // Others discuss
          const otherAgents = agents.filter(a => a.role !== todo.assignee && a.role !== AgentRole.MODERATOR && a.role !== AgentRole.EXPERT && a.role !== AgentRole.USER);
          let discussionLog = `负责人方案：\n${solution}\n`;

          for (const other of otherAgents.slice(0, 2)) {
            if (stopRef.current) break;
            setState(prev => ({ ...prev, currentActiveAgent: other.title }));
            const { content: comment, usage: discussUsage } = await agentDiscussTodo(topic, todo.content, solution, other.role, agents, memory);
            await updateTokens(discussUsage, `讨论待办: ${todo.content} (由${other.title})`);
            if (stopRef.current) break;
            
            addMessage({
              senderId: other.id,
              senderName: other.title,
              senderRole: other.role,
              content: comment,
              type: 'chat'
            });
            discussionLog += `${other.title}：${comment}\n`;
          }

          // Moderator Finalize
          if (stopRef.current) break;
          setState(prev => ({ ...prev, currentActiveAgent: "主持人" }));
          const { data: finalization, usage: finalizeUsage } = await moderatorFinalizeTodo(todo.content, discussionLog);
          await updateTokens(finalizeUsage, `确认待办: ${todo.content}`);
          if (stopRef.current) break;

          addMessage({
            senderId: "moderator",
            senderName: "主持人",
            senderRole: AgentRole.MODERATOR,
            content: `【决议】${finalization.reason}`,
            type: 'system'
          });

          if (finalization.status === 'confirmed') {
            setState(prev => ({
              ...prev,
              todos: prev.todos.map(t => t.id === todo.id ? { ...t, status: 'confirmed' } : t)
            }));

            if (finalization.type === 'supplement') {
              currentDraft += `\n\n### 补充：${todo.content}\n${finalization.finalContent}`;
            } else {
              setState(prev => ({
                ...prev,
                outputs: {
                  ...prev.outputs,
                  [`${currentNode.title}-${todo.content}`]: finalization.finalContent
                }
              }));
            }
          }
        }
        setState(prev => ({ ...prev, isHeartbeatActive: false }));

        // 5. Expert Scoring
        if (stopRef.current) return;
        setState(prev => ({ ...prev, currentStage: 3 }));
        const { data: expertResult, usage: scoreUsage } = await getExpertScore(topic, currentDraft, state.messages.map(m => m.content), state.currentNodeId === 1);
        await updateTokens(scoreUsage, `[${currentNode.title}] 专家评分`);
        if (stopRef.current) return;
        
        addMessage({
          senderId: "expert",
          senderName: "专家顾问",
          senderRole: AgentRole.EXPERT,
          content: `**专家点评：**\n${expertResult.feedback}\n\n**当前评分：${expertResult.score}**`,
          type: 'chat',
          stage: 3
        });

        if (expertResult.score >= 85) {
          isNodeCompleted = true;
          setState(prev => ({ ...prev, currentStage: 4, score: { ...prev.score, expert: expertResult.score } }));
          
          // Generate Final Outputs for this node
          const nodeOutputs: Record<string, string> = {};
          for (const outputName of currentNode.outputs) {
            nodeOutputs[outputName] = currentDraft; 
          }
          
          // Generate Meeting Minutes
          const participants = [currentNode.leadAgent, ...currentNode.participants];
          const { content: minutes, usage: minutesUsage } = await moderatorSummarizeMeeting(participants, state.messages.map(m => m.content).join('\n'), state.todos);
          await updateTokens(minutesUsage, `[${currentNode.title}] 生成会议纪要`);
          
          // Generate todo.log
          const todoLog = `# TODO.log - ${currentNode.title}\n\n| TODO事项描述 | 责任人 | 状态 |\n| --- | --- | --- |\n` + 
            state.todos.map(t => `| ${t.content} | ${t.assignee} | ${t.status} |`).join('\n');

          setState(prev => ({
            ...prev,
            outputs: {
              ...prev.outputs,
              ...nodeOutputs,
              [`${currentNode.title}-会议纪要`]: minutes,
              [`${currentNode.title}-todo.log`]: todoLog
            }
          }));

          addMessage({
            senderId: "ceo",
            senderName: "CEO",
            senderRole: AgentRole.CEO,
            content: "方案已达标，通过！产出物已生成。",
            type: 'chat',
            stage: 4
          });

          // Node Progression
          if (state.currentNodeId < nodes.length) {
            setTimeout(() => {
              if (confirm(`当前节点 [${currentNode.title}] 已完成。是否进入下一节点 [${nodes[state.currentNodeId].title}]？`)) {
                setState(prev => ({
                  ...prev,
                  currentNodeId: prev.currentNodeId + 1,
                  currentStage: 1,
                  messages: [...prev.messages, {
                    id: `sys-${Date.now()}`,
                    senderId: "system",
                    senderName: "系统",
                    senderRole: AgentRole.MODERATOR,
                    content: `进入下一节点：${nodes[state.currentNodeId].title}`,
                    type: 'system',
                    timestamp: Date.now()
                  }]
                }));
              }
            }, 1000);
          }
        } else {
          roundCount++;
          addMessage({
            senderId: "moderator",
            senderName: "主持人",
            senderRole: AgentRole.MODERATOR,
            content: `方案评分未达标（${expertResult.score}），根据专家意见，我们需要针对以下问题进行新一轮讨论：\n${expertResult.todos.join('\n')}`,
            type: 'system'
          });
          
          // Add expert's suggested todos
          const expertTodos: TodoItem[] = expertResult.todos.map((t: string, i: number) => ({
            id: `todo-expert-${Date.now()}-${i}`,
            content: t,
            assignee: AgentRole.CEO, 
            status: 'pending'
          }));
          setState(prev => ({ ...prev, todos: [...prev.todos, ...expertTodos] }));
          
          if (roundCount > 3) {
            addMessage({
              senderId: "system",
              senderName: "系统",
              senderRole: AgentRole.MODERATOR,
              content: "讨论轮次过多，请人工干预调整方案。",
              type: 'system'
            });
            break;
          }
        }
      }
    } catch (error) {
      if (stopRef.current) return;
      console.error("Meeting Error:", error);
      addMessage({
        senderId: "system",
        senderName: "系统",
        senderRole: AgentRole.MODERATOR,
        content: "会议执行过程中出现错误，请检查API配置。",
        type: 'system'
      });
    } finally {
      if (!stopRef.current) {
        setIsProcessing(false);
        setState(prev => ({ ...prev, isHeartbeatActive: false, currentActiveAgent: undefined }));
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    const userMsg = addMessage({
      senderId: "user",
      senderName: "观察者",
      senderRole: AgentRole.USER,
      content: inputText,
      type: 'chat'
    });
    
    setInputText("");
    setIsProcessing(true);

    // Simulate Agent response to user input
    const lastContext = state.messages.slice(-5).map(m => `${m.senderName}: ${m.content}`).join('\n');
    const moderatorPrompt = `你是会议主持人。用户（观察者）刚刚说："${inputText}"。请根据当前会议背景做出回应，并引导相关Agent（如CEO或运营总监）进行深度讨论。上下文：\n${lastContext}`;
    
    const { content: response, usage } = await callQwen([{ role: "user", content: moderatorPrompt }]);
    await updateTokens(usage, `主持人回应用户输入`);
    
    addMessage({
      senderId: "moderator",
      senderName: "主持人",
      senderRole: AgentRole.MODERATOR,
      content: response,
      type: 'chat'
    });

    setIsProcessing(false);
  };

  return (
    <div className="flex h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans">
      {/* Left Sidebar: Process & Roles */}
      <div className="w-80 border-r border-[#1A1A1A]/10 flex flex-col bg-white shadow-sm">
        <div className="p-6 border-bottom border-[#1A1A1A]/10">
          <h1 className="text-2xl font-serif italic font-bold flex items-center gap-2">
            <Brain className="w-8 h-8 text-[#5A5A40]" />
            智议平台
          </h1>
          <p className="text-xs text-[#1A1A1A]/50 mt-1 uppercase tracking-widest">智议协作系统 V1.6</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-[#1A1A1A]/40 font-bold mb-3 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" /> 行业选择
            </h2>
            <select 
              value={state.industry}
              onChange={(e) => setState(prev => ({ ...prev, industry: e.target.value as Industry }))}
              disabled={isMeetingActive}
              className="w-full p-2 bg-[#F5F5F0] border border-[#1A1A1A]/10 rounded-lg text-sm focus:outline-none focus:border-[#5A5A40] disabled:opacity-50"
            >
              {Object.values(Industry).map(ind => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-[#1A1A1A]/40 font-bold mb-3 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" /> 流程节点
            </h2>
            <div className="space-y-2">
              {nodes.map(node => (
                <div 
                  key={node.id}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer",
                    node.status === 'active' ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white border-[#1A1A1A]/5 hover:border-[#5A5A40]/30"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">Node {node.id}</span>
                    {node.status === 'completed' && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <p className="text-sm font-medium">{node.title}</p>
                  <p className={cn("text-[10px] mt-1 opacity-70", node.status === 'active' ? "text-white" : "text-[#1A1A1A]/60")}>
                    主责: {node.leadAgent}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-[#1A1A1A]/40 font-bold mb-3 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" /> 参会角色
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {agents.map(agent => (
                <div key={agent.id} className="p-2 bg-white border border-[#1A1A1A]/5 rounded-lg flex flex-col items-center text-center hover:shadow-md transition-shadow">
                  <img src={agent.avatar} alt={agent.title} className="w-10 h-10 rounded-full bg-[#F5F5F0] mb-2" referrerPolicy="no-referrer" />
                  <span className="text-[10px] font-bold leading-tight">{agent.title}</span>
                  <span className="text-[8px] text-[#1A1A1A]/40 mt-1">在线</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-[#1A1A1A]/10">
          <button 
            onClick={() => setShowConfig(true)}
            className="w-full py-3 rounded-full border border-[#1A1A1A]/20 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#1A1A1A] hover:text-white transition-all"
          >
            <Settings className="w-4 h-4" /> 系统配置
          </button>
        </div>
      </div>

      {/* Main Content: Chat & Discussion */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <div className="h-20 border-b border-[#1A1A1A]/10 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex flex-col gap-1 flex-1 max-w-xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  state.isHeartbeatActive ? "bg-red-500" : "bg-emerald-500"
                )} />
                <span className="text-sm font-medium">
                  {state.isHeartbeatActive ? '心跳监测中' : `阶段: ${state.currentStage === 1 ? '方案破冰' : state.currentStage === 2 ? '全员纠偏' : state.currentStage === 3 ? '自主闭环' : '共识产出'}`}
                </span>
              </div>
              {state.currentActiveAgent && (
                <>
                  <div className="h-4 w-px bg-[#1A1A1A]/10" />
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-[#5A5A40] animate-pulse" />
                    <span className="text-sm font-bold text-[#5A5A40]">
                      正在思考: {state.currentActiveAgent}
                    </span>
                  </div>
                </>
              )}
              <div className="h-4 w-px bg-[#1A1A1A]/10" />
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#5A5A40]" />
                <span className="text-sm font-medium">节点: {nodes[state.currentNodeId - 1].title}</span>
              </div>
              <div className="h-4 w-px bg-[#1A1A1A]/10" />
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#5A5A40]" />
                <span className="text-sm font-medium">Token: {state.totalTokens.toLocaleString()}</span>
              </div>
            </div>
            <input 
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="输入讨论主题，例如：医药零售数字化转型方案"
              disabled={isMeetingActive}
              className="w-full bg-transparent text-sm font-serif italic border-none focus:ring-0 p-0 placeholder:text-[#1A1A1A]/30"
            />
          </div>
          <div className="flex items-center gap-3">
            {isMeetingActive ? (
              <button 
                onClick={handleReset}
                className="px-6 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-red-100 transition-all"
              >
                <AlertCircle className="w-4 h-4" /> 终止讨论
              </button>
            ) : (
              <button 
                onClick={handleStart}
                disabled={isProcessing || !topicInput.trim()}
                className="px-6 py-2.5 bg-[#5A5A40] text-white rounded-full text-sm font-bold flex items-center gap-2 hover:bg-[#4A4A30] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#5A5A40]/20 transition-all"
              >
                <Play className="w-4 h-4" /> 启动流程
              </button>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <AnimatePresence initial={false}>
            {state.messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-4 max-w-4xl",
                  msg.senderRole === AgentRole.USER ? "ml-auto flex-row-reverse" : ""
                )}
              >
                {msg.type !== 'system' && (
                  <div className="flex-shrink-0">
                    <img 
                      src={agents.find(a => a.role === msg.senderRole)?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=System"} 
                      className="w-10 h-10 rounded-full bg-white border border-[#1A1A1A]/10"
                      alt={msg.senderName}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                
                <div className={cn(
                  "flex flex-col",
                  msg.senderRole === AgentRole.USER ? "items-end" : "items-start"
                )}>
                  {msg.type !== 'system' && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold">{msg.senderName}</span>
                      <span className="text-[10px] text-[#1A1A1A]/40">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                    msg.type === 'system' ? "bg-[#1A1A1A]/5 border border-[#1A1A1A]/10 w-full text-center italic text-[#1A1A1A]/60" :
                    msg.senderRole === AgentRole.USER ? "bg-[#5A5A40] text-white" : "bg-white border border-[#1A1A1A]/5"
                  )}>
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-[#1A1A1A]/5 prose-pre:text-[#1A1A1A]">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isProcessing && (
            <div className="flex gap-4 items-center text-[#1A1A1A]/40 italic text-sm">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-[#5A5A40] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-[#5A5A40] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-[#5A5A40] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span>Agent 正在深度思考中...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-[#1A1A1A]/10">
          <div className="max-w-4xl mx-auto relative">
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="作为观察者，输入你的指令或建议..."
              className="w-full pl-6 pr-16 py-4 bg-[#F5F5F0] rounded-full border border-[#1A1A1A]/10 focus:outline-none focus:border-[#5A5A40] transition-all text-sm"
            />
            <button 
              onClick={handleSendMessage}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#5A5A40] text-white rounded-full flex items-center justify-center hover:bg-[#4A4A30] transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar: Outputs & Todos */}
      <div className="w-96 border-l border-[#1A1A1A]/10 flex flex-col bg-white">
        <div className="flex border-b border-[#1A1A1A]/10">
          <button 
            onClick={() => setActiveTab('chat')}
            className={cn("flex-1 py-4 text-xs font-bold uppercase tracking-widest", activeTab === 'chat' ? "border-b-2 border-[#5A5A40] text-[#5A5A40]" : "text-[#1A1A1A]/40")}
          >
            实时动态
          </button>
          <button 
            onClick={() => setActiveTab('outputs')}
            className={cn("flex-1 py-4 text-xs font-bold uppercase tracking-widest", activeTab === 'outputs' ? "border-b-2 border-[#5A5A40] text-[#5A5A40]" : "text-[#1A1A1A]/40")}
          >
            产出物
          </button>
          <button 
            onClick={() => setActiveTab('todos')}
            className={cn("flex-1 py-4 text-xs font-bold uppercase tracking-widest", activeTab === 'todos' ? "border-b-2 border-[#5A5A40] text-[#5A5A40]" : "text-[#1A1A1A]/40")}
          >
            待办墙
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'outputs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold flex items-center gap-2"><FileText className="w-4 h-4" /> 物料清单</h3>
                <button className="text-[10px] text-[#5A5A40] font-bold flex items-center gap-1"><Download className="w-3 h-3" /> 全部导出</button>
              </div>
              {Object.keys(state.outputs).length === 0 ? (
                <div className="py-12 text-center text-[#1A1A1A]/30 italic text-sm">暂无产出物</div>
              ) : (
                Object.entries(state.outputs).map(([name, content]) => (
                  <div 
                    key={name} 
                    onClick={() => downloadMD(name, content)}
                    className="p-4 bg-[#F5F5F0] rounded-xl border border-[#1A1A1A]/5 group cursor-pointer hover:border-[#5A5A40]/30 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold">{name}</span>
                      <Download className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-[10px] text-[#1A1A1A]/60 line-clamp-2">{content.substring(0, 100)}...</p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'todos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" /> 待处理问题</h3>
                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{state.todos.filter(t => t.status === 'pending').length}</span>
              </div>
              {state.todos.length === 0 ? (
                <div className="py-12 text-center text-[#1A1A1A]/30 italic text-sm">暂无待办事项</div>
              ) : (
                state.todos.map(todo => (
                  <div key={todo.id} className="p-4 bg-white border border-[#1A1A1A]/10 rounded-xl flex gap-3 group">
                    <button className="mt-1 w-4 h-4 rounded border border-[#1A1A1A]/20 flex items-center justify-center group-hover:border-[#5A5A40] transition-all">
                      {(todo.status === 'resolved' || todo.status === 'confirmed') && <CheckCircle2 className="w-3 h-3 text-[#5A5A40]" />}
                    </button>
                    <div className="flex-1">
                      <p className={cn("text-xs font-medium", (todo.status === 'resolved' || todo.status === 'confirmed') ? "line-through text-[#1A1A1A]/40" : "")}>{todo.content}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] px-2 py-0.5 bg-[#5A5A40]/10 text-[#5A5A40] rounded-full font-bold">@{todo.assignee}</span>
                        {todo.status === 'confirmed' && <span className="text-[9px] px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-full font-bold">已确认</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-[#1A1A1A]/40 font-bold mb-4">专家评分 (阈值 85)</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span>专家顾问</span>
                      <span>{state.score.expert} / 100</span>
                    </div>
                    <div className="h-1.5 bg-[#1A1A1A]/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${state.score.expert}%` }}
                        className="h-full bg-[#5A5A40]"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span>CEO 评价</span>
                      <span>{state.score.ceo} / 100</span>
                    </div>
                    <div className="h-1.5 bg-[#1A1A1A]/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${state.score.ceo}%` }}
                        className="h-full bg-[#5A5A40]"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-[#1A1A1A]/40 font-bold mb-4">行业知识库 (已挂载)</h3>
                <div className="p-4 bg-[#F5F5F0] rounded-xl border border-[#1A1A1A]/5 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#5A5A40]" />
                      <span className="text-xs font-bold">{state.industry} 行业知识</span>
                    </div>
                    {state.industryKB && (
                      <button 
                        onClick={() => downloadMD(`${state.industry}-知识库`, state.industryKB!)}
                        className="text-[10px] text-[#5A5A40] hover:underline"
                      >
                        导出
                      </button>
                    )}
                  </div>
                  <div className="prose prose-invert prose-xs text-[10px] text-[#1A1A1A]/60 leading-relaxed">
                    <ReactMarkdown>{state.industryKB || "正在加载知识库..."}</ReactMarkdown>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfig && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#1A1A1A]/60 backdrop-blur-sm flex items-center justify-center p-8"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-4xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-[#1A1A1A]/10 flex items-center justify-between">
                <h2 className="text-xl font-serif italic font-bold">系统架构配置</h2>
                <button onClick={() => setShowConfig(false)} className="w-8 h-8 rounded-full hover:bg-[#1A1A1A]/5 flex items-center justify-center">×</button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 grid grid-cols-2 gap-8">
                <section className="space-y-4">
                  <h3 className="text-sm font-bold flex items-center gap-2"><Users className="w-4 h-4" /> Agent 角色管理</h3>
                  <div className="space-y-2">
                    {agents.map(agent => (
                      <div 
                        key={agent.id} 
                        onClick={() => setSelectedAgent(agent)}
                        className={cn(
                          "p-3 rounded-xl flex items-center justify-between cursor-pointer transition-all",
                          selectedAgent?.id === agent.id ? "bg-[#5A5A40] text-white" : "bg-[#F5F5F0] hover:bg-[#1A1A1A]/5"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <img src={agent.avatar} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                          <span className="text-xs font-bold">{agent.title}</span>
                        </div>
                        <ChevronRight className="w-3 h-3 opacity-40" />
                      </div>
                    ))}
                  </div>
                </section>
                <section className="space-y-4">
                  {selectedAgent ? (
                    <div className="p-6 bg-[#F5F5F0] rounded-2xl border border-[#1A1A1A]/5 h-full overflow-y-auto">
                      <div className="flex items-center gap-4 mb-6">
                        <img src={selectedAgent.avatar} className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
                        <div>
                          <h4 className="font-bold text-sm">{selectedAgent.title}</h4>
                          <p className="text-[10px] text-[#1A1A1A]/40 uppercase tracking-widest">岗位详情 (MD)</p>
                        </div>
                      </div>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{selectedAgent.mdContent || "暂无详细说明"}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold flex items-center gap-2"><Settings className="w-4 h-4" /> API & 数据库配置</h3>
                      <div className="space-y-4">
                        <div className="p-4 bg-[#F5F5F0] rounded-xl space-y-2">
                          <p className="text-[10px] font-bold uppercase text-[#1A1A1A]/40">LLM Provider</p>
                          <div className="flex items-center justify-between text-xs">
                            <span>Qwen (Aliyun)</span>
                            <span className="text-emerald-500 font-bold">Connected</span>
                          </div>
                        </div>
                        <div className="p-4 bg-[#F5F5F0] rounded-xl space-y-2">
                          <p className="text-[10px] font-bold uppercase text-[#1A1A1A]/40">Database</p>
                          <div className="flex items-center justify-between text-xs">
                            <span>Supabase</span>
                            <span className="text-emerald-500 font-bold">Connected</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="flex-1 py-3 bg-[#5A5A40] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                            <Upload className="w-3 h-3" /> 导入配置 (MD)
                          </button>
                          <button className="flex-1 py-3 border border-[#1A1A1A]/20 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                            <Download className="w-3 h-3" /> 导出配置 (MD)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
