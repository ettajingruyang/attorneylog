#!/usr/bin/env node
// ─── Demo 假数据种子脚本 ──────────────────────────────────
// 用法：npm run seed:demo
// 生成一个带虚构成员/案件/工时的演示数据文件（data/worklog-data.json），
// 适合公开 Demo 实例使用。所有成员的演示密码统一为 demo123。
//
// 注意：会覆盖已有的 data/worklog-data.json，请勿在生产数据上执行。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'worklog-data.json');

const DEMO_PASSWORD = 'demo123';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return { salt, hash };
}

// 与前端一致的伪随机（保证每次生成的数据一致，方便复现问题）
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260915);
const today = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

// 虚构成员与案件（无任何真实客户信息）
const members = [
  { id: 'm-demo-admin', name: '林律师', role: '合伙人', color: '#4E5452', joinedAt: addDays(today, -180), isAdmin: true },
  { id: 'm-demo-2', name: '王律师', role: '律师', color: '#722F37', joinedAt: addDays(today, -120), isAdmin: false },
  { id: 'm-demo-3', name: '陈助理', role: '律师助理', color: '#4A6B8A', joinedAt: addDays(today, -60), isAdmin: false },
];

const matters = [
  { id: 'mt-demo-1', name: '星海科技股权融资', client: '星海科技', code: 'XH-RZ-2026', feeType: 'fixed', fixedFee: 120000, rates: {}, memberIds: [], budgetHours: 80, internal: false, status: 'active', color: '#722F37', createdAt: addDays(today, -60) },
  { id: 'mt-demo-2', name: '云帆数据合规审查', client: '云帆数据', code: 'YF-HG-2026', feeType: 'hourly', fixedFee: 0, rates: { 'm-demo-admin': 2000, 'm-demo-2': 1200 }, memberIds: [], budgetHours: null, internal: false, status: 'active', color: '#4A6B8A', createdAt: addDays(today, -45) },
  { id: 'mt-demo-3', name: '清风劳动合同纠纷', client: '清风实业', code: 'QF-LD-2026', feeType: 'hourly', fixedFee: 0, rates: { 'm-demo-2': 1200 }, memberIds: [], budgetHours: null, internal: false, status: 'active', color: '#B5651D', createdAt: addDays(today, -30) },
  { id: 'mt-demo-4', name: '常法顾问-东海贸易', client: '东海贸易', code: 'DH-CF-2026', feeType: 'fixed', fixedFee: 60000, rates: {}, memberIds: [], budgetHours: null, internal: false, status: 'active', color: '#2F4F4F', createdAt: addDays(today, -90) },
  { id: 'mt-demo-5', name: '律所自媒体运营', client: '内部项目', code: 'MEDIA-2026', feeType: 'fixed', fixedFee: 0, rates: {}, memberIds: [], budgetHours: null, internal: true, status: 'active', color: '#A3B18A', createdAt: addDays(today, -180) },
  { id: 'mt-demo-6', name: 'AI 工具研发', client: '内部项目', code: 'AI-2026', feeType: 'fixed', fixedFee: 0, rates: {}, memberIds: [], budgetHours: null, internal: true, status: 'active', color: '#5F8D8B', createdAt: addDays(today, -100) },
];

const genericPool = ['起草法律意见书', '审阅合同条款', '客户电话会议', '法规检索与研究', '修改备忘录', '内部案件讨论', '回复客户咨询', '整理工作底稿'];
const poolByMatter = {
  'mt-demo-1': ['尽调清单准备', '交易文件起草', '股权架构讨论', '交割文件核对'],
  'mt-demo-2': ['数据出境评估', '起草合规整改建议', '客户访谈', '个人信息保护审计'],
  'mt-demo-3': ['劳动仲裁材料准备', '证据整理', '与对方律师沟通', '调解方案讨论'],
  'mt-demo-4': ['合同日常审查', '法律咨询回复', '月度法律报告'],
  'mt-demo-5': ['撰写公众号文章', '选题策划', '排版与校对'],
  'mt-demo-6': ['AI 工具测试', '提示词调优', '内部培训材料'],
};
const NON_BILLABLE = ['内部会议', '客户会议', '业务拓展', '客户维护', '团队管理', '行政事务', '学习培训'];

const entries = [];
let eid = 0;
for (let i = 45; i >= 0; i--) {
  const date = addDays(today, -i);
  const dow = new Date(date + 'T00:00:00').getDay();
  if (dow === 0) continue;
  if (dow === 6 && rand() < 0.6) continue;
  const author = members[Math.floor(rand() * members.length)];
  const n = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    if (rand() < 0.72) {
      const mid = ['mt-demo-1', 'mt-demo-2', 'mt-demo-3', 'mt-demo-4', 'mt-demo-4', 'mt-demo-5', 'mt-demo-6'][Math.floor(rand() * 7)];
      const pool = poolByMatter[mid];
      entries.push({
        id: `demo-e-${eid++}`, date, memberId: author.id, matterId: mid, category: '案件工作',
        description: pool[Math.floor(rand() * pool.length)],
        minutes: [30, 45, 60, 90, 120, 150][Math.floor(rand() * 6)],
        billable: !matters.find((m) => m.id === mid).internal,
      });
    } else {
      const cat = NON_BILLABLE[Math.floor(rand() * NON_BILLABLE.length)];
      entries.push({
        id: `demo-e-${eid++}`, date, memberId: author.id, matterId: null, category: cat,
        description: cat, minutes: [30, 60, 60, 90][Math.floor(rand() * 4)], billable: false,
      });
    }
  }
}

const todos = [
  { id: 'demo-td-1', date: today, memberId: 'm-demo-admin', text: '星海科技融资项目交割清单确认', matterId: 'mt-demo-1', done: false, actualMinutes: null, billable: true, entryId: null, originDate: today, tags: ['重要'], ddl: addDays(today, 2) },
  { id: 'demo-td-2', date: today, memberId: 'm-demo-admin', text: '云帆数据月度合规简报', matterId: 'mt-demo-2', done: false, actualMinutes: null, billable: true, entryId: null, originDate: today },
  { id: 'demo-td-3', date: today, memberId: 'm-demo-admin', text: '本周公众号选题', matterId: 'mt-demo-5', done: false, actualMinutes: null, billable: false, entryId: null, originDate: today },
  { id: 'demo-td-4', date: today, memberId: 'm-demo-admin', text: '东海贸易季度法律报告', matterId: 'mt-demo-4', done: true, actualMinutes: 60, billable: true, entryId: 'demo-td-4-e', originDate: today },
  { id: 'demo-td-5', date: today, memberId: 'm-demo-2', text: '清风案证据清单更新', matterId: 'mt-demo-3', done: false, actualMinutes: null, billable: true, entryId: null, originDate: today },
];
entries.push({ id: 'demo-td-4-e', date: today, memberId: 'm-demo-admin', matterId: 'mt-demo-4', category: '案件工作', description: '东海贸易季度法律报告', minutes: 60, billable: true });

const state = {
  teamName: '演示团队',
  teamSubtitle: 'Demo Team',
  members: members.map((m) => ({ ...m, pw: hashPassword(DEMO_PASSWORD) })),
  matters,
  entries,
  todos,
  notes: [],
  presence: [
    { memberId: 'm-demo-admin', date: today, status: 'office', updatedAt: new Date().toISOString() },
    { memberId: 'm-demo-2', date: today, status: 'remote', updatedAt: new Date().toISOString() },
    { memberId: 'm-demo-3', date: today, status: 'trip', updatedAt: new Date().toISOString() },
  ],
  currentMemberId: 'm-demo-admin',
  targetRate: 2000,
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(DATA_FILE, JSON.stringify({ savedAt: Date.now(), state }, null, 2));
console.log(`演示数据已写入: ${DATA_FILE}`);
console.log('团队成员: ' + members.map((m) => m.name).join(' / '));
console.log(`演示密码（所有成员相同）: ${DEMO_PASSWORD}`);
