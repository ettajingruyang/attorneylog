// ─── 数据模型 ─────────────────────────────────────────────
// 所有记录都带 memberId，天然支持未来团队律师加入。

export interface Member {
  id: string;
  name: string;
  role: string; // 合伙人 / 律师 / 律师助理 ...
  color: string;
  joinedAt: string; // YYYY-MM-DD
  isAdmin?: boolean; // 管理员：可看全部成员数据、分配待办、管理团队与案件
  pw?: { salt: string; hash: string } | null; // 密码哈希（scrypt），仅存服务端，永不下发到客户端
  hasPassword?: boolean; // 服务器视图下发：该成员是否已设置密码
}

export type MatterStatus = 'active' | 'archived';
export type MatterFeeType = 'fixed' | 'hourly';

/** 客户案件的合作状态 */
export type ContractStatus = 'prospect' | 'signed' | 'closed';

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; color: string }> = {
  prospect: { label: '洽谈中', color: '#8E8E93' },
  signed: { label: '已签约', color: '#3B6D11' },
  closed: { label: '已结项', color: '#534AB7' },
};

/** 删除墓碑：多设备按条合并时用于同步“已删除”这一事实 */
export interface Tombstone {
  c: 'todos' | 'entries' | 'notes';
  id: string;
  at: number; // 删除时间（毫秒）
}

/** 单笔收款记录 */
export interface Payment {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // ¥
  note?: string;
}

export interface Matter {
  id: string;
  name: string; // 案件名称
  client: string; // 客户
  code: string; // 案件编号
  feeType: MatterFeeType; // fixed = 固定费用（Cap）；hourly = 按小时计费
  fixedFee: number; // 固定费用（¥），feeType=fixed 时为封顶费用；0 表示未填写
  rates: Record<string, number>; // 各成员小时费率（¥/h）：memberId -> rate
  memberIds: string[]; // 参与成员；空数组 = 全员可见可记录
  budgetHours: number | null; // 预算工时
  internal: boolean; // true = 内部/非计费项目（AI FDE、自媒体、Pitch 等）
  status: MatterStatus;
  color: string;
  createdAt: string;
  contractStatus?: ContractStatus; // 合作状态（客户案件）
  totalFee?: number | null; // 合同总金额（收费进度用；固定费用案件默认同 fixedFee）
  payments?: Payment[]; // 收款记录（已支付 = 累计；待支付 = 总额 - 已付）
}

/** 非计费事务分类（matterId 为 null 时使用 category） */
export const NON_BILLABLE_CATEGORIES = [
  'Pitch / 投标',
  '内部会议',
  '客户会议',
  '业务拓展',
  '客户维护',
  '团队管理',
  '行政事务',
  '学习培训',
  '其他事务',
] as const;

export interface TimeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  memberId: string;
  matterId: string | null; // null = 非计费事务
  category: string; // 非计费时的分类；计费记录记 '案件工作'
  description: string;
  minutes: number;
  billable: boolean;
  updatedAt?: number; // 最后修改时间（毫秒），用于多设备按条合并
}

/** 待办板块定义（团队可自定义：增删改标签与颜色，管理员管理） */
export interface TodoCategoryDef {
  id: string;
  label: string;
  hint?: string;
  color: string;
}

/** 待办标签定义（团队可自定义） */
export interface TodoTagDef {
  id: string;
  label: string;
  color: string;
}

/** 默认板块（id 与历史数据兼容） */
export const DEFAULT_TODO_CATEGORIES: TodoCategoryDef[] = [
  { id: 'legal', label: '法律工作', hint: '案件的具体法律事务', color: '#8FA8C8' },
  { id: 'biz', label: '事务性工作', hint: '沟通协调、投标报价、开票收费等', color: '#D9A86C' },
  { id: 'life', label: '个人生活', hint: '', color: '#9DB89A' },
];

/** 默认标签（id 与历史数据兼容） */
export const DEFAULT_TODO_TAGS: TodoTagDef[] = [
  { id: '重要', label: '重要', color: '#C0565F' },
  { id: '紧急', label: '紧急', color: '#CE8A4E' },
];

/** 板块/标签 id 统一为字符串，自定义后不再受预置枚举限制 */
export type TodoCategory = string;
export type TodoTag = string;

/** 团队成员当日打卡状态 */
export type PresenceStatus = 'office' | 'remote' | 'trip' | 'leave';

export const PRESENCE_META: Record<PresenceStatus, { label: string; color: string }> = {
  office: { label: '办公室', color: '#3B6D11' },
  remote: { label: '远程', color: '#185FA5' },
  trip: { label: '出差', color: '#854F0B' },
  leave: { label: '休假', color: '#534AB7' },
};

export interface Presence {
  memberId: string;
  date: string; // YYYY-MM-DD
  status: PresenceStatus;
  note?: string;
  updatedAt: string; // ISO 时间
}

export interface Todo {
  id: string;
  date: string;
  memberId: string;
  text: string;
  matterId: string | null;
  category?: TodoCategory; // 板块分类 id；缺省按关联案件推断（客户案件→法律，内部/无案件→事务性）
  done: boolean;
  actualMinutes: number | null; // 完成时登记的实际用时
  billable: boolean;
  entryId: string | null; // 完成时自动生成的工时记录
  note?: string; // 该待办的备注/要点
  tags?: TodoTag[]; // 标签 id 列表（重要/紧急等，团队可自定义）
  ddl?: string | null; // 截止日期 YYYY-MM-DD；与标签一起决定自动优先级
  originDate?: string; // 首次创建日期；自动顺延到第二天后仍保留原始日期
  updatedAt?: number; // 最后修改时间（毫秒），用于多设备按条合并
  assignedBy?: string | null; // 分配人 id；空 = 自己记录的
  participants?: string[]; // 共同参与人（负责人 memberId 之外的其他参与者），参与人也能看到并完成这条待办
}

/** 随记本：电话记录、客户指示、临时想法。html 支持高亮等简单格式 */
export interface ScratchNote {
  id: string;
  date: string;
  memberId: string;
  html: string;
  createdAt: string;
  updatedAt: string;
}
