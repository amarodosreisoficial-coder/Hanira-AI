/* eslint-disable @typescript-eslint/no-explicit-any */
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { IkigaiAnalysis } from './analysis-contract';
import type { IkigaiAnswers, IkigaiFollowUp } from './types';
import { analysisSources } from './analysis-contract';

pdfMake.vfs = pdfFonts;
pdfMake.addVirtualFileSystem(pdfFonts);

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
  const i: any[] = [{ text: t, headlineLevel: 1, font: F, bold: true, fontSize: 18, color: C.pb, margin: [0, 26, 0, 10] }];
  if (s) i.push({ text: s, font: F, italics: true, fontSize: 11, color: C.tm, margin: [0, 4, 0, 14] });
  return i;
}

function insightItems(items: any[]): any[] {
  return items.map((it) => ({ columns: [{ text: it.text, font: F, fontSize: 11, color: C.ts, lineHeight: 1.55, width: '*' }], margin: [0, 0, 0, 8] }));
}

function evidenceBlock(ev: any[], src: Map<string, { label: string; answer: string }>): any {
  if (!ev?.length) return { text: '', margin: [0, 0, 0, 0] };
  return { stack: ev.map((r) => ({ text: [{ text: `${src.get(r.source)?.label ?? 'Sua resposta'}: `, color: C.pb }, { text: `“${r.quote}”`, italics: true }], fontSize: 8.5, color: C.tm, margin: [0, 3, 0, 3] })), margin: [0, 4, 0, 10] };
}
function cover(o: PdfOpts): any[] {
  const n = dispName(o), d = fmtDate(o.generationDate);
  return [
    { image: 'haniraLogo', width: 80, alignment: 'center', margin: [0, 45, 0, 25] },
    { text: 'Relatório Ikigai Pessoal', font: F, bold: true, fontSize: 30, color: C.tp, alignment: 'center', margin: [0, 20, 0, 16] },
    { text: 'Mapa de propósito, talentos, motivações e direções possíveis', font: F, italics: true, fontSize: 14, color: C.ts, alignment: 'center', margin: [20, 0, 20, 35] },
    { text: n, font: F, bold: true, fontSize: 20, color: C.pb, alignment: 'center', margin: [0, 0, 0, 18] },
    { text: d, font: F, fontSize: 14, color: C.tm, alignment: 'center' },
    { text: 'MEU IKIGAI', font: F, bold: true, fontSize: 18, color: C.tp, alignment: 'center', margin: [0, 38, 0, 15] },
    { text: 'O que você ama · Seus potenciais\nSua contribuição · Caminhos de realização', font: F, fontSize: 11, color: C.pb, alignment: 'center', lineHeight: 1.5 },
    { text: 'Página reservada para o seu relatório pessoal', font: F, italics: true, fontSize: 9, color: C.tm, alignment: 'center', margin: [0, 24, 0, 0] },
    { text: 'Hanira AI — Relatório Ikigai Pessoal', font: F, fontSize: 8, color: C.tm, alignment: 'center', margin: [0, 32, 0, 0] },
  ];
}
function synthesis(r: IkigaiAnalysis, src: ReturnType<typeof analysisSources>): any[] {
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
    { pageBreak: 'before', stack: [
      ...secHead('Um mapa para sua reflexão', 'Interesses, potenciais, contribuição e realização'),
      { alignment: 'center', canvas: [
        { type: 'ellipse', x: 100, y: 65, r1: 62, r2: 62, color: C.nb, fillOpacity: 0.2, lineColor: C.pb, lineWidth: 1 },
        { type: 'ellipse', x: 160, y: 65, r1: 62, r2: 62, color: C.nv, fillOpacity: 0.2, lineColor: C.nv, lineWidth: 1 },
        { type: 'ellipse', x: 100, y: 125, r1: 62, r2: 62, color: C.nc, fillOpacity: 0.2, lineColor: C.pc, lineWidth: 1 },
        { type: 'ellipse', x: 160, y: 125, r1: 62, r2: 62, color: C.pv, fillOpacity: 0.2, lineColor: C.nv, lineWidth: 1 },
      ], margin: [0, 6, 0, 12] },
      { text: r.title, font: F, italics: true, fontSize: 13, color: C.tp, alignment: 'center' },
      { text: 'Este mapa é um apoio à reflexão, não uma definição única do Ikigai. O sentido da vida também pode estar nas relações e nas pequenas experiências cotidianas.', fontSize: 9.5, color: C.tm, alignment: 'center', lineHeight: 1.4, margin: [0, 10, 0, 0] },
    ] },
  ];
}
function detail(t: string, items: any[], src: Map<string, { label: string; answer: string }>): any[] {
  return [...secHead(t), ...items.flatMap((item) => [...insightItems([item]), evidenceBlock(item.evidence, src)])];
}

export function build(o: PdfOpts): any {
  const { report } = o, src = analysisSources(o.input as any), n = dispName(o), d = fmtDate(o.generationDate);
  const dis = 'Este relatório foi elaborado a partir de informações fornecidas voluntariamente pelo participante e de interpretação assistida por IA. É um material complementar de autoconhecimento e desenvolvimento, não constituindo certificação de competências, diagnóstico ou avaliação psicológica.';
  return {
    pageSize: 'A4', pageMargins: [40, 76, 40, 56],
    background: (cp: number) => ({ stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, color: C.dk }] },
      ...(cp === 1 ? [] : [{ absolutePosition: { x: 40, y: 22 }, columns: [
        { image: 'haniraLogo', width: 28 },
        { text: 'Relatório Ikigai Pessoal', width: 180, font: F, bold: true, fontSize: 9, color: C.pb },
        { text: n, width: 260, font: F, fontSize: 8, color: C.tm, alignment: 'right', italics: true },
      ], columnGap: 12 }]),
    ] }),
    pageBreakBefore: (node: any, container: any) => node.headlineLevel === 1 && container.getFollowingNodesOnPage().length === 0,
    footer: (cp: number, pc: number) => ({
      columns: [
        { text: 'Hanira AI', font: F, fontSize: 8, color: C.tm },
        { text: d, font: F, fontSize: 8, color: C.tm, alignment: 'right' },
        { text: 'Página ' + cp + ' de ' + pc, font: F, fontSize: 8, color: C.tm, alignment: 'right', margin: [0, 0, 16, 0] },
      ], margin: [40, 16, 40, 0],
    }),
    content: [
      ...cover(o),
      { text: '', pageBreak: 'after' },
      ...synthesis(report, src),
      ...diagram(report),
      ...detail('Quem sou e o que me motiva', report.passions, src),
      ...detail('Talentos e potenciais', report.strengths, src),
      ...detail('Valores pessoais', report.values, src),
      ...detail('Contribuição e impacto desejado', report.contribution, src),
      ...detail('Caminhos sustentáveis de realização', report.sustainablePaths, src),
      ...detail('Possíveis direções', report.possibleDirections, src),
      ...detail('Desafios identificados', report.challenges.length ? report.challenges.map((c) => ({ text: c.text, evidence: c.evidence })) : [{ text: 'Nenhum obstáculo explícito foi identificado nas respostas.' }], src),
      ...detail('Plano de ação — 7, 30 e 90 dias', [
        { text: `7 dias — ${report.actionPlan.days7.text}`, evidence: report.actionPlan.days7.evidence },
        { text: `30 dias — ${report.actionPlan.days30.text}`, evidence: report.actionPlan.days30.evidence },
        { text: `90 dias — ${report.actionPlan.days90.text}`, evidence: report.actionPlan.days90.evidence },
      ], src),
      { stack: [
        { text: 'Reflexão Final', headlineLevel: 1, font: F, bold: true, fontSize: 18, color: C.pb, margin: [0, 26, 0, 10] },
        { text: report.reflection, font: F, fontSize: 11, color: C.ts, lineHeight: 1.7, margin: [0, 8, 0, 24] },
        { text: dis, font: F, italics: true, fontSize: 8.5, color: C.tm, alignment: 'center', lineHeight: 1.4 },
      ] },
    ],
    images: o.images || { haniraLogo: typeof window === 'undefined' ? '/hanira-logo-primary.png' : new URL('/hanira-logo-primary.png', window.location.origin).href },
    defaultStyle: { font: F, color: C.tp },
  } as any;
}

export async function generateIkigaiPdfBlob(o: PdfOpts): Promise<Blob> {
  return pdfMake.createPdf(build(o)).getBlob();
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

export async function generateIkigaiPdfDataUri(o: PdfOpts): Promise<string> {
  return pdfMake.createPdf(build(o)).getDataUrl();
}
