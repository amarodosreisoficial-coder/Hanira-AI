/* eslint-disable @typescript-eslint/no-explicit-any */
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { IkigaiAnalysis } from './analysis-contract';
import type { IkigaiAnswers, IkigaiFollowUp } from './types';
import { analysisSources } from './analysis-contract';

pdfMake.vfs = pdfFonts;

const C = {
  dk: '#070608', dk2: '#03040a', pb: '#00b7ff', nb: '#168bff',
  pc: '#00b7ff', nc: '#00b7ff', pv: '#7047ff', nv: '#9b5cff',
  tp: '#f7f8fc', ts: '#e8eaf2', tm: '#9ca3b8', ac: '#101224', bd: '#94a3c4',
} as const;
const F = 'Roboto';

interface PdfOpts {
  report: IkigaiAnalysis;
  input: { answers: IkigaiAnswers; followUps: IkigaiFollowUp[] };
  displayName?: string;
  generationDate: string;
  images?: Record<string, string>;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function dispName(o: PdfOpts) { return o.displayName?.trim() || 'Participante do Relatório Ikigai'; }

function secHead(t: string, s?: string): any[] {
  const i: any[] = [{ text: t, font: F, bold: true, fontSize: 18, color: C.pb, margin: [0, 26, 0, 10], border: ['bottom'], borderWidth: 1, borderColor: C.bd }];
  if (s) i.push({ text: s, font: F, italics: true, fontSize: 11, color: C.tm, margin: [0, 4, 0, 14] });
  return i;
}

function insightItems(items: any[]): any[] {
  return items.map((it) => ({ columns: [{ text: it.text, font: F, fontSize: 11, color: C.ts, lineHeight: 1.55, width: '*' }], margin: [0, 0, 0, 8] }));
}

function evidenceBlock(ev: any[], src: Map<string, { label: string; answer: string }>): any {
  if (!ev?.length) return { text: '', margin: [0, 0, 0, 0] };
  return { columns: ev.map((r) => { const s = src.get(r.source); return { width: '33%', stack: [{ text: s ? s.label : 'Sua resposta', font: F, italics: true, fontSize: 8, color: C.pb, margin: [0, 0, 0, 4] }, { text: '"' + r.quote + '"', font: F, fontSize: 8.5, color: C.tm, italic: true }] } }) , margin: [0, 4, 0, 10] };
}
function cover(o: PdfOpts): any[] {
  const n = dispName(o), d = fmtDate(o.generationDate);
  return [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, fill: C.dk }] },
    { image: 'haniraLogo', width: 110, alignment: 'center', margin: [0, 90, 0, 0] },
    { canvas: [{ type: 'roundRect', x: 97, y: 290, w: 400, h: 400, r: 30, fill: C.pv, opacity: 0.12 }] },
    { text: 'Relatório Ikigai Pessoal', font: F, bold: true, fontSize: 34, color: C.tp, alignment: 'center', margin: [0, 50, 0, 16] },
    { text: 'Mapa de propósito, talentos, motivações e direções possíveis', font: F, italics: true, fontSize: 16, color: C.ts, alignment: 'center', margin: [0, 0, 0, 70] },
    { text: n.toUpperCase(), font: F, bold: true, fontSize: 22, color: C.pb, alignment: 'center', margin: [0, 0, 0, 48] },
    { text: d, font: F, fontSize: 14, color: C.tm, alignment: 'center' },
    { canvas: [
      { type: 'circle', x: 297, y: 680, r: 90, fill: C.nb, opacity: 0.08, lineWidth: 2, color: C.pb },
      { type: 'circle', x: 177, y: 820, r: 90, fill: C.nv, opacity: 0.08, lineWidth: 2, color: C.pv },
      { type: 'circle', x: 417, y: 820, r: 90, fill: C.nc, opacity: 0.08, lineWidth: 2, color: C.pc },
      { type: 'circle', x: 297, y: 740, r: 65, fill: '#ffffff', opacity: 0.85 },
    ] },
    { text: 'MEU IKIGAI', font: F, bold: true, fontSize: 20, color: C.dk2, alignment: 'center' },
    { text: 'O que você ama', font: F, bold: true, fontSize: 11, color: C.pb, alignment: 'center', margin: [0, 8, 0, 0] },
    { text: 'No que você é bom', font: F, bold: true, fontSize: 11, color: C.pv, alignment: 'center', margin: [0, 4, 0, 0] },
    { text: 'Como pode contribuir', font: F, bold: true, fontSize: 11, color: C.pc, alignment: 'center', margin: [0, 4, 0, 0] },
    { text: 'Caminho de realização', font: F, bold: true, fontSize: 11, color: C.nc, alignment: 'center', margin: [0, 4, 0, 0] },
    { text: 'Página reservada para o seu relatório pessoal', font: F, italics: true, fontSize: 9, color: C.tm, alignment: 'center', margin: [0, 24, 0, 0] },
    { text: 'Hanira AI — Relatório Ikigai Pessoal', font: F, fontSize: 8, color: C.tm, alignment: 'center', margin: [0, 32, 0, 0] },
  ];
}
function synthesis(r: IkigaiAnalysis): any[] {
  const src = analysisSources({ answers: { story: "" } as any, followUps: [] });
  return [
    ...secHead('Apresentação e Fundamento Central', 'O que é este relatório e como interpretá-lo'),
    { text: 'Este documento organiza suas reflexões pessoais — interesses, valores, habilidades e caminhos possíveis — em um mapa de autoconhecimento. É um material complementar de desenvolvimento pessoal e profissional, não substituto para currículo formal, avaliação psicológica ou diagnóstico.', font: F, fontSize: 10.5, color: C.ts, lineHeight: 1.6, margin: [0, 0, 0, 16] },
    { text: 'MEU PROPÓSITO EM CONSTRUÇÃO', font: F, bold: true, fontSize: 16, color: C.pb, margin: [0, 0, 0, 10], border: ['bottom'], borderWidth: 1, borderColor: C.bd },
    { text: r.synthesis.text, font: F, fontSize: 11.5, color: C.tp, lineHeight: 1.7, margin: [0, 8, 0, 12] },
    evidenceBlock(r.synthesis.evidence, src),
    { columns: [
      { width: '50%', stack: [ { text: 'O que parece motivar você', font: F, bold: true, fontSize: 11, color: C.pb, margin: [0, 0, 0, 6] }, { text: r.passions.map((p) => '• ' + p.text).join('\n'), font: F, fontSize: 10.5, color: C.ts, lineHeight: 1.5 } ] },
      { width: '50%', stack: [ { text: 'Qual direção se destaca', font: F, bold: true, fontSize: 11, color: C.pv, margin: [0, 0, 0, 6] }, { text: r.possibleDirections.map((d) => '• ' + d.text).join('\n'), font: F, fontSize: 10.5, color: C.ts, lineHeight: 1.5 } ] },
    ], margin: [0, 0, 0, 16] },
  ];
}

function diagram(r: IkigaiAnalysis): any[] {
  return [
    ...secHead('Diagrama Clássico do Ikigai', 'A interseção dos quatro elementos do seu propósito'),
    { canvas: [
      { type: 'circle', x: 297, y: 60, r: 95, fill: C.nb, opacity: 0.06, lineWidth: 2, color: C.pb },
      { type: 'circle', x: 140, y: 260, r: 95, fill: C.nv, opacity: 0.06, lineWidth: 2, color: C.pv },
      { type: 'circle', x: 454, y: 260, r: 95, fill: C.nc, opacity: 0.06, lineWidth: 2, color: C.pc },
      { type: 'circle', x: 297, y: 160, r: 70, fill: '#ffffff', opacity: 0.9 },
    ] },
    { text: 'MEU IKIGAI', font: F, bold: true, fontSize: 22, color: C.pb, alignment: 'center' },
    { text: r.title, font: F, italics: true, fontSize: 15, color: C.tp, alignment: 'center', margin: [0, 4, 0, 0] },
    { text: 'O diagrama acima representa os quatro elementos fundamentais do Ikigai. A área central indica o ponto onde paixões, talentos, contribuição e caminhos se encontram.', font: F, fontSize: 9.5, color: C.tm, alignment: 'center', lineHeight: 1.5, margin: [0, 10, 0, 0] },
  ];
}
function detail(t: string, items: any[], src: Map<string, { label: string; answer: string }>): any[] {
  return [ ...secHead(t), ...insightItems(items) ];
}

export function build(o: PdfOpts): any {
  const { report } = o, src = analysisSources(o.input as any), n = dispName(o), d = fmtDate(o.generationDate);
  const dis = 'Este relatório foi elaborado a partir de informações fornecidas voluntariamente pelo participante e de interpretação assistida por IA. É um material complementar de autoconhecimento e desenvolvimento, não constituindo certificação de competências, diagnóstico ou avaliação psicológica.';
  return {
    pageSize: 'A4', pageMargins: [40, 56, 40, 40],
    header: (cp: number) => cp === 1 ? null : {
      columns: [
        { image: 'haniraLogo', width: 32 },
        { text: 'Relatório Ikigai Pessoal', font: F, bold: true, fontSize: 10, color: C.pb, margin: [0, 0, 0, 2] },
        ...(n ? [{ text: n, font: F, fontSize: 9, color: C.tm, alignment: 'right', italic: true }] : []),
      ], columnGap: 16, margin: [0, 0, 0, 14],
    },
    footer: (cp: number, pc: number) => ({
      columns: [
        { text: 'Hanira AI', font: F, fontSize: 8, color: C.tm },
        { text: d, font: F, fontSize: 8, color: C.tm, alignment: 'right' },
        { text: 'Página ' + cp + ' de ' + pc, font: F, fontSize: 8, color: C.tm, alignment: 'right', margin: [0, 0, 16, 0] },
      ], margin: [0, 16, 0, 0],
    }),
    content: [
      ...cover(o),
      { text: '', pageBreak: 'after' },
      ...synthesis(report),
      ...diagram(report),
      ...detail('Quem sou e o que me motiva', report.passions, src),
      ...detail('Talentos e potenciais', report.strengths, src),
      ...detail('Valores pessoais', report.values, src),
      ...detail('Contribuição e impacto desejado', report.contribution, src),
      ...detail('Caminhos sustentáveis de realização', report.sustainablePaths, src),
      ...detail('Possíveis direções', report.possibleDirections, src),
      ...detail('Desafios identificados', report.challenges.map((c) => ({ text: c.text, evidence: c.evidence })), src),
      ...detail('Plano de ação — 7, 30 e 90 dias', [
        { text: report.actionPlan.days7.text, evidence: report.actionPlan.days7.evidence },
        { text: report.actionPlan.days30.text, evidence: report.actionPlan.days30.evidence },
        { text: report.actionPlan.days90.text, evidence: report.actionPlan.days90.evidence },
      ], src),
      { text: 'Reflexão Final', font: F, bold: true, fontSize: 18, color: C.pb, margin: [0, 26, 0, 10], border: ['bottom'], borderWidth: 1, borderColor: C.bd },
      { text: report.reflection, font: F, fontSize: 11, color: C.ts, lineHeight: 1.7, margin: [0, 8, 0, 24] },
      { text: dis, font: F, italics: true, fontSize: 8.5, color: C.tm, alignment: 'center', lineHeight: 1.4 },
    ],
    images: o.images || { haniraLogo: '/hanira-logo-primary.png' },
    defaultStyle: { font: F, color: C.tp },
  } as any;
}

export function generateIkigaiPdfBlob(o: PdfOpts): Promise<Blob> {
  return new Promise((res, rej) => {
    try { pdfMake.createPdf(build(o)).getBlob((b: Blob) => res(b)); } catch (e) { rej(e); }
  });
}

export function downloadIkigaiPdf(o: PdfOpts): Promise<void> {
  return generateIkigaiPdfBlob(o).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-ikigai-' + o.generationDate.replace(/[^0-9]/g, '') + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

export function generateIkigaiPdfDataUri(o: PdfOpts): Promise<string> {
  return new Promise((res, rej) => {
    try {
      pdfMake.createPdf(build(o)).getBlob((blob: Blob) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
    } catch (e) { rej(e); }
  });
}