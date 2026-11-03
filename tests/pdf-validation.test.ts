import { describe, expect, it } from "vitest";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { build, generateIkigaiPdfBlob, generateIkigaiPdfDataUri } from "@/lib/ikigai/pdf-generator";
import { buildAnalysisInput } from "@/lib/ikigai/analysis-contract";
import { parseGeneratedAnalysis } from "@/lib/ikigai/analysis-generator";
import { analysisAnswers, createGeneratedAnalysisReport } from "./helpers/ikigai-analysis";
import type { IkigaiAnalysis } from "@/lib/ikigai/analysis-contract";
import type { IkigaiAnswers } from "@/lib/ikigai/types";

pdfMake.vfs = pdfFonts;

const makeReport = (): IkigaiAnalysis => ({
  contractVersion: "1.0",
  title: "Ikigai de Teste",
  synthesis: {
    kind: "interpretation",
    text: "Teste com acentuação: ção, ã, õ, á, é, í, ó, ú.",
    evidence: [{ source: "identity", quote: "Ensinar com tecnologia" }],
  },
  passions: [{ kind: "interpretation", text: "Ensinar com tecnologia", evidence: [{ source: "love", quote: "Ensinar com tecnologia" }] }],
  strengths: [{ kind: "possibility", text: "Escutar estudantes", evidence: [{ source: "strengths", quote: "Escutar estudantes" }] }],
  values: [{ kind: "interpretation", text: "Apoiar jovens", evidence: [{ source: "impact", quote: "Apoiar jovens" }] }],
  contribution: [{ kind: "possibility", text: "Contribuir para a educação", evidence: [{ source: "future", quote: "Contribuir para a educação" }] }],
  sustainablePaths: [{ kind: "possibility", text: "Ensinar em encontros curtos", evidence: [{ source: "story", quote: "Ensinar em encontros curtos" }] }],
  possibleDirections: [{ kind: "possibility", text: "Criar uma escola", evidence: [{ source: "future", quote: "Criar uma escola" }] }],
  challenges: [{ text: "Falta de tempo", evidence: [{ source: "impact", quote: "Falta de tempo" }] }],
  actionPlan: {
    days7: { kind: "possibility", text: "Reserve tempo para ensinar", evidence: [{ source: "identity", quote: "Reserve tempo para ensinar" }] },
    days30: { kind: "possibility", text: "Experimente escutar estudantes", evidence: [{ source: "love", quote: "Experimente escutar estudantes" }] },
    days90: { kind: "possibility", text: "Reavalie a ideia de uma escola", evidence: [{ source: "future", quote: "Reavalie a ideia de uma escola" }] },
  },
  reflection: "Reflexão final de teste.",
});

const makeInput = (): { answers: IkigaiAnswers; followUps: never[] } => ({
  answers: {
    identity: "Pessoa de Teste",
    love: "Ensinar com tecnologia",
    strengths: "Escutar estudantes",
    impact: "Apoiar jovens",
    future: "Criar uma escola",
    story: "",
  },
  followUps: [],
});

describe("PDF: VFS, fontes e geração de documento", () => {
  it("gera bytes PDF e data URI com o contrato validado e a API Promise do pdfmake 0.3", async () => {
    const input = buildAnalysisInput(analysisAnswers, []);
    const report = parseGeneratedAnalysis(JSON.stringify(createGeneratedAnalysisReport()), input);
    const options = { report, input, generationDate: "2026-11-02T12:00:00Z", images: { haniraLogo: `data:image/png;base64,${readFileSync("public/hanira-logo-primary.png").toString("base64")}` } };
    const blob = await generateIkigaiPdfBlob(options);
    expect(blob.type).toBe("application/pdf");
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    if (process.env.HANIRA_PDF_QA_OUTPUT === "1") {
      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/ikigai-fictional-qa.pdf", Buffer.from(await blob.arrayBuffer()));
      console.log(`PDF fictício: ${blob.size} bytes`);
    }
    expect(await generateIkigaiPdfDataUri(options)).toMatch(/^data:application\/pdf;base64,JVBER/);
  }, 15_000);
  it("VFS está inicializada com fontes", () => {
    expect(pdfMake.vfs).toBeDefined();
    const keys = Object.keys(pdfMake.vfs);
    expect(keys.length).toBeGreaterThan(0);
    console.log("VFS font keys:", keys.join(", "));
  });

  it("createPdf funciona com VFS e texto acentuado", () => {
    const doc = {
      pageSize: "A4",
      content: [
        { text: "Relatório Ikigai de Teste", font: "Roboto", bold: true, fontSize: 18 },
        { text: "Acentuação: ção, ã, õ, á, é, í, ó, ú", font: "Roboto", fontSize: 12 },
      ],
    };
    const pdf = pdfMake.createPdf(doc);
    expect(pdf).toBeDefined();
    expect(typeof pdf.getBlob).toBe("function");
    console.log("createPdf funciona com VFS e texto acentuado");
  });

  it("build() produz definição de documento válida com acentuação, seções e logo", () => {
    const doc = build({
      report: makeReport(),
      input: makeInput(),
      displayName: "Pessoa de Teste",
      generationDate: new Date().toISOString(),
    });

    expect(doc.pageSize).toBe("A4");
    expect(doc.content).toBeDefined();
    expect(doc.content.length).toBeGreaterThan(0);
    expect(doc.images.haniraLogo).toBe("/hanira-logo-primary.png");

    const html = JSON.stringify(doc.content);
    expect(html).toContain("ção");
    expect(html).toContain("ã");
    expect(html).toContain("õ");
    expect(html).toContain("Reserve tempo para ensinar");
    expect(html).toContain("Experimente escutar estudantes");
    expect(html).toContain("Reavalie a ideia de uma escola");
    expect(html).toContain("haniraLogo");

    console.log("Documento construído com sucesso:", doc.content.length, "blocos de conteúdo");
  });

  it("build() aceita sobrescrita de imagens para ambiente de teste", () => {
    const doc = build({
      report: makeReport(),
      input: makeInput(),
      displayName: "Pessoa de Teste",
      generationDate: new Date().toISOString(),
      images: {},
    });

    expect(doc.images).toEqual({});
    expect(doc.content.length).toBeGreaterThan(0);
    console.log("build() aceita sobrescrita de imagens");
  });
});
