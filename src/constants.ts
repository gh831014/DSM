import { AgentConfig, AgentRole, ProcessNode, Industry } from "./types";

export const INDUSTRY_KNOWLEDGE: Record<Industry, string[]> = {
  [Industry.PHARMA]: [
    "GSP (药品经营质量管理规范) 合规性",
    "处方药与非处方药分类管理规定",
    "医保统筹对接与结算流程",
    "药品冷链物流配送标准",
    "执业药师在线咨询服务规范"
  ],
  [Industry.RETAIL]: [
    "全渠道零售 (Omni-channel) 整合策略",
    "库存周转率 (ITO) 优化模型",
    "会员生命周期价值 (LTV) 管理",
    "供应链柔性化改造方案",
    "社区团购与即时零售配送体系"
  ],
  [Industry.EDUCATION]: [
    "在线教育合规性与备案制度",
    "素质教育课程体系研发标准",
    "获客成本 (CAC) 与转化率优化",
    "双师直播教学交互机制",
    "教育内容版权保护与数字化管理"
  ]
};

export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "ceo",
    role: AgentRole.CEO,
    title: "首席执行官 (CEO)",
    responsibilities: ["确定目标", "分工安排", "最终决策", "方案拍板"],
    knowledgeBase: ["企业战略", "市场趋势", "投融资", "组织架构"],
    skills: ["决策力", "领导力", "资源整合"],
    focusPoints: ["ROI", "战略一致性", "市场竞争力"],
    coreOutputs: ["方案初稿", "最终落地包"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=CEO",
    mdContent: `# CEO 岗位说明书
## 核心职责
- 负责公司整体战略规划与决策
- 协调各部门资源，确保项目目标达成
- 监控公司财务状况与投资回报率 (ROI)

## 行业洞察
- 关注宏观经济环境对行业的影响
- 识别潜在的市场机会与竞争威胁`
  },
  {
    id: "coo",
    role: AgentRole.COO,
    title: "运营总监 (COO)",
    responsibilities: ["细化运营方案", "预算管理", "执行监控"],
    knowledgeBase: ["用户增长", "供应链管理", "成本控制"],
    skills: ["落地执行", "流程优化", "数据分析"],
    focusPoints: ["运营效率", "预算合理性", "用户体验"],
    coreOutputs: ["运营计划", "运营预算"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=COO",
    mdContent: `# COO 岗位说明书
## 核心职责
- 制定并实施年度运营计划
- 优化业务流程，提升运营效率
- 管理运营预算，确保成本效益最大化`
  },
  {
    id: "cpo",
    role: AgentRole.CPO,
    title: "产品总监 (CPO)",
    responsibilities: ["产品规划", "需求优先级", "路标制定"],
    knowledgeBase: ["产品设计", "用户研究", "竞品分析"],
    skills: ["产品思维", "原型设计", "需求拆解"],
    focusPoints: ["产品价值", "功能完备性", "技术可行性"],
    coreOutputs: ["产品规划", "需求清单", "产品Roadmap"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=CPO",
    mdContent: `# CPO 岗位说明书
## 核心职责
- 定义产品愿景与长期发展路线图
- 领导产品团队进行市场调研与用户分析
- 确保产品功能满足市场需求并具备竞争力`
  },
  {
    id: "purchase",
    role: AgentRole.CPO_PURCHASE,
    title: "采购总监",
    responsibilities: ["选品定价", "采购计划", "供应商管理"],
    knowledgeBase: ["供应链", "成本核算", "市场行情"],
    skills: ["谈判能力", "成本控制", "品类管理"],
    focusPoints: ["采购成本", "毛利率", "库存周转"],
    coreOutputs: ["选品定价清单", "采购计划"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Purchase",
    mdContent: `# 采购总监 岗位说明书
## 核心职责
- 建立并维护高效的供应链体系
- 负责商品选品、定价及采购合同谈判
- 监控库存水平，优化采购周期`
  },
  {
    id: "cto",
    role: AgentRole.CTO,
    title: "技术总监 (CTO)",
    responsibilities: ["架构设计", "技术任务拆解", "技术选型"],
    knowledgeBase: ["系统架构", "数据库设计", "前沿技术"],
    skills: ["架构能力", "技术攻关", "团队管理"],
    focusPoints: ["系统稳定性", "开发周期", "技术债"],
    coreOutputs: ["架构方案设计", "表结构定义", "接口文档"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=CTO",
    mdContent: `# CTO 岗位说明书
## 核心职责
- 负责公司技术架构的设计与演进
- 领导技术团队进行核心技术攻关
- 确保系统的高可用性、安全性与可扩展性`
  },
  {
    id: "moderator",
    role: AgentRole.MODERATOR,
    title: "会议主持人",
    responsibilities: ["推动会议进行", "分配发言权", "确认决议有效性"],
    knowledgeBase: ["会议引导", "沟通技巧"],
    skills: ["气氛活跃", "冲突化解", "总结归纳"],
    focusPoints: ["会议进度", "全员参与度", "决议达成"],
    coreOutputs: ["会议纪要"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Moderator",
    mdContent: `# 会议主持人 岗位说明书
## 核心职责
- 掌控会议节奏，确保讨论不偏离主题
- 鼓励全员参与，平衡各方发言机会
- 总结会议共识，形成清晰的行动计划`
  },
  {
    id: "expert",
    role: AgentRole.EXPERT,
    title: "专家顾问",
    responsibilities: ["解答疑难卡点", "提供解题思路", "方案评分"],
    knowledgeBase: ["行业痛点", "行业规范", "最优解法"],
    skills: ["深度洞察", "专业指导", "风险预警"],
    focusPoints: ["方案专业度", "行业合规性", "前瞻性"],
    coreOutputs: ["行业最优解法"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Expert",
    mdContent: `# 专家顾问 岗位说明书
## 核心职责
- 提供行业前瞻性见解与专业指导
- 协助解决项目中的重大技术或业务难题
- 对方案进行独立评估与风险预警`
  }
];

export const PROCESS_NODES: ProcessNode[] = [
  {
    id: 1,
    title: "CEO 整体方案",
    leadAgent: AgentRole.CEO,
    participants: [AgentRole.CEO, AgentRole.COO, AgentRole.CPO, AgentRole.CPO_PURCHASE, AgentRole.CTO],
    outputs: ["CEO整体方案"],
    status: 'active',
    isMandatory: true
  },
  {
    id: 2,
    title: "运营方案细化",
    leadAgent: AgentRole.COO,
    participants: [AgentRole.CEO, AgentRole.COO, AgentRole.CPO, AgentRole.CPO_PURCHASE, AgentRole.CTO],
    outputs: ["运营计划", "运营预算", "线下线上物料清单"],
    status: 'pending',
    isMandatory: true
  },
  {
    id: 3,
    title: "选品与采购计划",
    leadAgent: AgentRole.CPO_PURCHASE,
    participants: [AgentRole.CEO, AgentRole.COO, AgentRole.CPO, AgentRole.CPO_PURCHASE, AgentRole.CTO],
    outputs: ["选品定价清单", "采购计划"],
    status: 'pending',
    isMandatory: true
  },
  {
    id: 4,
    title: "产品规划与Roadmap",
    leadAgent: AgentRole.CPO,
    participants: [AgentRole.CEO, AgentRole.COO, AgentRole.CPO, AgentRole.CPO_PURCHASE, AgentRole.CTO],
    outputs: ["产品规划", "产品需求优先级任务拆分清单", "产品Roadmap路线图"],
    status: 'pending',
    isMandatory: false
  },
  {
    id: 5,
    title: "技术架构与任务拆解",
    leadAgent: AgentRole.CTO,
    participants: [AgentRole.CEO, AgentRole.COO, AgentRole.CPO, AgentRole.CPO_PURCHASE, AgentRole.CTO],
    outputs: ["架构设计方案", "交互机制定义文档", "任务拆分清单"],
    status: 'pending',
    isMandatory: false
  }
];
