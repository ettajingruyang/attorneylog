// ─── 小时单导出：Excel / Word / Markdown ─────────────────────
// 三种格式共用同一份 Timesheet 数据模型，保证内容一致。
// 若带 billing（按项目导出客户案件），顶部会生成「人员费用汇总」账单表：
// 每人小时 × 费率 = 金额；固定费用案件最后附 Cap 行。

import * as XLSX from 'xlsx';
import { saveBlob } from '@/lib/platform';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

export interface TimesheetRow {
  date: string; // YYYY-MM-DD
  memberName: string;
  matterName: string; // 案件名；非案件记录为分类名
  description: string;
  billable: boolean;
  hours: number; // 已换算为小时，保留 2 位小数
}

export interface TimesheetGroup {
  name: string;
  hours: number;
  rate?: number | null; // ¥/h，无则不显示费率列
  amount?: number | null; // ¥
}

/** 账单头：按项目导出客户案件时生成 */
export interface BillingInfo {
  client: string;
  code: string;
  feeType: 'fixed' | 'hourly';
  fixedFee: number; // feeType=fixed 时的 Cap
  people: { name: string; hours: number; rate: number | null; amount: number | null }[];
  totalHours: number;
  totalAmount: number | null; // 有人未设费率时为 null
}

export interface Timesheet {
  title: string; // 例：小时单 · Etta
  scope: string; // 例：2026-08-01 ~ 2026-08-31
  generatedAt: string; // 例：2026-09-05 15:20
  rows: TimesheetRow[]; // 按日期升序
  totalHours: number;
  billableHours: number;
  groupLabel: string; // 按案件汇总 / 按人员汇总
  groups: TimesheetGroup[];
  billing?: BillingInfo;
}

function yuan(v: number): string {
  return `¥${Math.round(v).toLocaleString('zh-CN')}`;
}

// 浏览器里 <a download> 直接保存；Cherry 小程序沙箱里走 cherry.file 保存对话框
function downloadBlob(blob: Blob, filename: string) {
  void saveBlob(blob, filename);
}

function baseName(ts: Timesheet): string {
  const who = ts.title.replace(/^小时单 · /, '').replace(/[\\/:*?"<>|\s（）()]+/g, '');
  return `小时单-${who}-${ts.scope.replace(/ ~ /, '_')}`;
}

// ─── Excel ──────────────────────────────────────────────────

export function exportExcel(ts: Timesheet) {
  const aoa: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  const push = (row: (string | number)[]) => aoa.push(row);
  const row = () => aoa.length - 1; // 最后一行下标

  push([ts.title]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  if (ts.billing) {
    push([`客户：${ts.billing.client}`, '', `案件编号：${ts.billing.code}`]);
    push([`时间段：${ts.scope}`, '', `导出时间：${ts.generatedAt}`]);
  } else {
    push([`时间段：${ts.scope}`, '', `导出时间：${ts.generatedAt}`]);
  }
  push([]);

  // 账单头：人员费用汇总
  if (ts.billing) {
    const b = ts.billing;
    push(['费用汇总']);
    push(['人员', '小时', '小时费率（¥/h）', '金额（¥）']);
    for (const p of b.people) {
      push([p.name, p.hours, p.rate ?? '未设费率', p.amount != null ? Math.round(p.amount) : '—']);
    }
    push(['合计（按小时费率）', b.totalHours, '', b.totalAmount != null ? Math.round(b.totalAmount) : '—']);
    if (b.feeType === 'fixed') {
      push(['固定费用（Cap）', '', '', b.fixedFee > 0 ? b.fixedFee : '未填写']);
      if (b.totalAmount != null && b.fixedFee > 0 && b.totalAmount > b.fixedFee) {
        push(['说明：按小时费率合计已超出固定费用，实际按 Cap 收取']);
        merges.push({ s: { r: row(), c: 0 }, e: { r: row(), c: 3 } });
      }
    }
    push([]);
  }

  // 明细
  push(['工时明细']);
  push(['日期', '人员', '案件 / 事项', '工作内容', '计费', '小时']);
  for (const r of ts.rows) {
    push([r.date, r.memberName, r.matterName, r.description, r.billable ? '计费' : '非计费', r.hours]);
  }
  push([]);
  push(['合计', '', '', '', '', ts.totalHours]);
  push(['其中计费', '', '', '', '', ts.billableHours]);
  push(['非计费', '', '', '', '', Number((ts.totalHours - ts.billableHours).toFixed(2))]);
  push([]);

  // 分组小计
  const withRate = ts.groups.some((g) => g.rate !== undefined);
  push([ts.groupLabel]);
  push(withRate ? ['名称', '小时', '费率（¥/h）', '金额（¥）'] : ['名称', '小时']);
  for (const g of ts.groups) {
    if (withRate) push([g.name, g.hours, g.rate ?? '—', g.amount != null ? Math.round(g.amount) : '—']);
    else push([g.name, g.hours]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 44 }, { wch: 8 }, { wch: 10 }];
  ws['!merges'] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '小时单');
  XLSX.writeFile(wb, `${baseName(ts)}.xlsx`);
}

// ─── Word ───────────────────────────────────────────────────

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'D6CFC0' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D6CFC0' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'D6CFC0' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'D6CFC0' },
};

function cell(text: string, opts: { bold?: boolean; header?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new TableCell({
    borders: CELL_BORDER,
    shading: opts.header ? { fill: 'F0EBE0' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, bold: opts.bold ?? opts.header ?? false, size: 18, font: 'Microsoft YaHei' })],
      }),
    ],
  });
}

function para(text: string, opts: { bold?: boolean; size?: number; color?: string; before?: number; after?: number } = {}) {
  return new Paragraph({
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 20, color: opts.color, font: 'Microsoft YaHei' })],
  });
}

export async function exportWord(ts: Timesheet) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: ts.title, font: 'Microsoft YaHei' })],
    }),
  ];
  if (ts.billing) {
    children.push(para(`客户：${ts.billing.client}    案件编号：${ts.billing.code}`));
  }
  children.push(para(`时间段：${ts.scope}`));
  children.push(para(`导出时间：${ts.generatedAt}`, { color: '888888', after: 160 }));

  // 账单头
  if (ts.billing) {
    const b = ts.billing;
    children.push(para('费用汇总', { bold: true, size: 24, before: 120, after: 120 }));
    children.push(
      new Table({
        width: { size: 85, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: ['人员', '小时', '小时费率（¥/h）', '金额（¥）'].map((t, i) =>
              cell(t, { header: true, align: i > 0 ? AlignmentType.RIGHT : undefined }),
            ),
          }),
          ...b.people.map(
            (p) =>
              new TableRow({
                children: [
                  cell(p.name),
                  cell(p.hours.toFixed(2), { align: AlignmentType.RIGHT }),
                  cell(p.rate != null ? yuan(p.rate) : '未设费率', { align: AlignmentType.RIGHT }),
                  cell(p.amount != null ? yuan(p.amount) : '—', { align: AlignmentType.RIGHT }),
                ],
              }),
          ),
          new TableRow({
            children: [
              cell('合计（按小时费率）', { bold: true }),
              cell(b.totalHours.toFixed(2), { bold: true, align: AlignmentType.RIGHT }),
              cell(''),
              cell(b.totalAmount != null ? yuan(b.totalAmount) : '—', { bold: true, align: AlignmentType.RIGHT }),
            ],
          }),
          ...(b.feeType === 'fixed'
            ? [
                new TableRow({
                  children: [
                    cell('固定费用（Cap）', { bold: true }),
                    cell(''),
                    cell(''),
                    cell(b.fixedFee > 0 ? yuan(b.fixedFee) : '未填写', { bold: true, align: AlignmentType.RIGHT }),
                  ],
                }),
              ]
            : []),
        ],
      }),
    );
    if (b.feeType === 'fixed' && b.totalAmount != null && b.fixedFee > 0 && b.totalAmount > b.fixedFee) {
      children.push(para('说明：按小时费率合计已超出固定费用，实际按 Cap 收取。', { color: '8A6D2F', before: 80 }));
    }
    children.push(para('', { after: 120 }));
  }

  // 明细
  children.push(para('工时明细', { bold: true, size: 24, before: 120, after: 120 }));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['日期', '人员', '案件 / 事项', '工作内容', '计费', '小时'].map((t) => cell(t, { header: true })),
        }),
        ...ts.rows.map(
          (r) =>
            new TableRow({
              children: [
                cell(r.date),
                cell(r.memberName),
                cell(r.matterName),
                cell(r.description),
                cell(r.billable ? '计费' : '非计费'),
                cell(r.hours.toFixed(2), { align: AlignmentType.RIGHT }),
              ],
            }),
        ),
        new TableRow({
          children: [
            cell('合计', { bold: true }),
            cell(''), cell(''), cell(''), cell(''),
            cell(ts.totalHours.toFixed(2), { bold: true, align: AlignmentType.RIGHT }),
          ],
        }),
      ],
    }),
  );

  // 分组小计
  const withRate = ts.groups.some((g) => g.rate !== undefined);
  children.push(para(ts.groupLabel, { bold: true, size: 24, before: 240, after: 120 }));
  children.push(
    new Table({
      width: { size: 70, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: withRate
            ? [cell('名称', { header: true }), cell('小时', { header: true, align: AlignmentType.RIGHT }), cell('费率（¥/h）', { header: true, align: AlignmentType.RIGHT }), cell('金额（¥）', { header: true, align: AlignmentType.RIGHT })]
            : [cell('名称', { header: true }), cell('小时', { header: true, align: AlignmentType.RIGHT })],
        }),
        ...ts.groups.map(
          (g) =>
            new TableRow({
              children: withRate
                ? [
                    cell(g.name),
                    cell(g.hours.toFixed(2), { align: AlignmentType.RIGHT }),
                    cell(g.rate != null ? yuan(g.rate) : '—', { align: AlignmentType.RIGHT }),
                    cell(g.amount != null ? yuan(g.amount) : '—', { align: AlignmentType.RIGHT }),
                  ]
                : [cell(g.name), cell(g.hours.toFixed(2), { align: AlignmentType.RIGHT })],
            }),
        ),
      ],
    }),
  );

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${baseName(ts)}.docx`);
}

// ─── Markdown ───────────────────────────────────────────────

export function exportMarkdown(ts: Timesheet) {
  const lines: string[] = [`# ${ts.title}`, ''];
  if (ts.billing) lines.push(`- 客户：${ts.billing.client}　- 案件编号：${ts.billing.code}`);
  lines.push(
    `- 时间段：${ts.scope}`,
    `- 导出时间：${ts.generatedAt}`,
    `- 合计：**${ts.totalHours.toFixed(2)} 小时**（计费 ${ts.billableHours.toFixed(2)}h / 非计费 ${(ts.totalHours - ts.billableHours).toFixed(2)}h）`,
    '',
  );

  if (ts.billing) {
    const b = ts.billing;
    lines.push(
      '## 费用汇总',
      '',
      '| 人员 | 小时 | 小时费率（¥/h） | 金额（¥） |',
      '| --- | ---: | ---: | ---: |',
      ...b.people.map(
        (p) => `| ${p.name} | ${p.hours.toFixed(2)} | ${p.rate != null ? yuan(p.rate) : '未设费率'} | ${p.amount != null ? yuan(p.amount) : '—'} |`,
      ),
      `| **合计（按小时费率）** | **${b.totalHours.toFixed(2)}** |  | **${b.totalAmount != null ? yuan(b.totalAmount) : '—'}** |`,
    );
    if (b.feeType === 'fixed') {
      lines.push(`| **固定费用（Cap）** |  |  | **${b.fixedFee > 0 ? yuan(b.fixedFee) : '未填写'}** |`);
      if (b.totalAmount != null && b.fixedFee > 0 && b.totalAmount > b.fixedFee) {
        lines.push('', '> 说明：按小时费率合计已超出固定费用，实际按 Cap 收取。');
      }
    }
    lines.push('');
  }

  lines.push(
    '## 工时明细',
    '',
    '| 日期 | 人员 | 案件 / 事项 | 工作内容 | 计费 | 小时 |',
    '| --- | --- | --- | --- | --- | ---: |',
    ...ts.rows.map(
      (r) =>
        `| ${r.date} | ${r.memberName} | ${r.matterName} | ${r.description.replace(/\|/g, '｜')} | ${r.billable ? '计费' : '非计费'} | ${r.hours.toFixed(2)} |`,
    ),
    `| **合计** |  |  |  |  | **${ts.totalHours.toFixed(2)}** |`,
    '',
    `## ${ts.groupLabel}`,
    '',
  );
  const withRate = ts.groups.some((g) => g.rate !== undefined);
  if (withRate) {
    lines.push(
      '| 名称 | 小时 | 费率（¥/h） | 金额（¥） |',
      '| --- | ---: | ---: | ---: |',
      ...ts.groups.map(
        (g) => `| ${g.name} | ${g.hours.toFixed(2)} | ${g.rate != null ? yuan(g.rate) : '—'} | ${g.amount != null ? yuan(g.amount) : '—'} |`,
      ),
    );
  } else {
    lines.push('| 名称 | 小时 |', '| --- | ---: |', ...ts.groups.map((g) => `| ${g.name} | ${g.hours.toFixed(2)} |`));
  }
  lines.push('');
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), `${baseName(ts)}.md`);
}
