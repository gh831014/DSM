import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export enum AgentRole {
  CEO = "CEO",
  COO = "运营总监",
  CPO = "产品总监",
  CPO_PURCHASE = "采购总监",
  CTO = "技术总监",
  MODERATOR = "会议主持人",
  EXPERT = "专家顾问",
  USER = "观察者(用户)"
}

export enum Industry {
  PHARMA = "医药零售",
  RETAIL = "传统零售",
  EDUCATION = "在线教育"
}

export interface AgentConfig {
  id: string;
  role: AgentRole;
  title: string;
  responsibilities: string[];
  knowledgeBase: string[];
  skills: string[];
  focusPoints: string[];
  coreOutputs: string[];
  avatar: string;
  mdContent?: string; // Markdown content for detailed view
}

export interface ProcessNode {
  id: number;
  title: string;
  leadAgent: AgentRole;
  participants: AgentRole[];
  outputs: string[];
  status: 'pending' | 'active' | 'completed';
  isMandatory: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: AgentRole;
  content: string;
  timestamp: number;
  type: 'chat' | 'system' | 'thought';
  stage?: number;
}

export interface TodoItem {
  id: string;
  content: string;
  assignee: AgentRole;
  status: 'pending' | 'resolved' | 'confirmed';
  sourceMessageId?: string;
  impactedOutput?: string;
}

export interface TokenLog {
  date: string;
  discussion: string;
  consumption: number;
}

export interface MeetingState {
  currentNodeId: number;
  currentStage: number; // 1-4
  messages: Message[];
  todos: TodoItem[];
  outputs: Record<string, string>; // Output name -> content (MD)
  score: {
    expert: number;
    ceo: number;
  };
  industry: string;
  industryKB?: string;
  isHeartbeatActive?: boolean;
  currentActiveAgent?: string;
  totalTokens: number;
  tokenLogs: TokenLog[];
}
