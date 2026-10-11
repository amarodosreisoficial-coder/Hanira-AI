# PACKAGE 18.3.5 — Visual Refresh + Composer Unificado + Sidebar Colapsável

**Projeto:** Hanira AI
**Branch:** `pacote-18-3-5-visual-refresh-unified-composer`
**Base:** `main` @ `a954693`
**Custo operacional:** R$ 0,00/mês (nenhum billing, serviço pago, API paga ou fallback pago adicionado).

---

## 1. Objetivo

Grande melhoria visual e de UX no chat da Hanira mantendo o fluxo STT/microfone já
conquistado. Foco: visual premium (tema escuro), composer unificado, microfone
inline elegante, sidebar colapsável refinada e branding Hanira com o logo existente.

## 2. Identidade visual

- **Tema:** grafite near-black (`--background: #07060a`), superfícies
  `--sidebar #08070c`, `--composer #0d0b12`.
- **Acento:** violeta Hanira usado com parcimônia (`--primary #a78bfa`);
  micro-ciano sutil (`--cyan #22d3ee`) apenas para toques.
- **Estilo:** bordas discretas, glow leve, respiro, ícones limpos, sem caixas
  "quadradonas". Tokens reutilizados do design system existente (`@theme inline`).

## 3. Logo / ícone

- **Arquivo usado:** `public/hanira-symbol.svg` (vetorial, nítido em qualquer tamanho).
- `HaniraMark` trocou o tile quadrado (`object-cover` + borda dura) por um container
  com **glow radial suave** e `object-contain` + padding — sem "quadradinho".
- Classe `.nira-mark` adiciona um drop-shadow violeta leve.
- Nenhum asset externo foi criado, baixado ou inventado. Apenas arquivos já existentes
  em `public/`.

## 4. Composer unificado

- **Menu `+`:** ações secundárias agrupadas em um popover (`.hanira-menu`):
  anexar documento, anexar imagem, tirar foto. Fecha por outside-click/Escape.
- **Botão "Criar imagem" removido** da barra — a Nira entende o pedido de imagem
  pelo texto via `resolveComposerIntent` (intenção de alto confiança). O
  `ImageComposerOptions` continua aparecendo quando o modo imagem é ativado.
- **Microfone inline:** fica na mesma barra, ao lado do botão de enviar.
- **Contador de caracteres** mantido (`id="chat-message-length"`).

## 5. Microfone / STT (fluxo preservado)

- **Estado normal:** texto · `+` · microfone · enviar.
- **Estado gravando:** a MESMA superfície entra em modo gravação
  (`.is-recording`); o `VoiceRecorder` em modo `inline` substitui o textarea dentro
  da superfície — **sem card separado acima**.
  - waveform animada (barras), duração `MM:SS / MM:SS`, pausa/continuar,
    finalizar e transcrever, cancelar (`X`).
  - gravação inicia automaticamente ao abrir (privacy dialog já tratado antes).
- **Sem auto-send:** o transcrito continua caindo no draft do composer para edição
  (`store.setDraft(nextDraft)`), gates e `requestMediaAccess("microphone")`
  preservados (contrato STT intacto).
- **Waveform:** animação simulada leve (CSS, `@keyframes nira-wave`) que reage ao
  estado recording/paused. Não usa `AnalyserNode` real — ver Limitações.

## 6. Sidebar colapsável

- Já existente (`sidebarCollapsed`); refinada para visual premium:
  - "Nova conversa" com destaque violeta sutil e `+` que rotaciona no hover.
  - conversa ativa com realce violeta discreto.
  - modo recolhido = apenas ícones alinhados, com tooltips (`title`).
- Rótulos de contrato preservados: `Recolher barra lateral`, `Nova conversa`,
  `Buscar conversas`.

## 7. Cabeçalho / mensagens

- Cabeçalho: "Hanira" em gradiente (`text-gradient`) + "Nira Intelligence" com
  hierarquia refinada.
- Mensagens: bubbles do usuário e da Nira herdam os novos tokens (mais contraste e
  respiro). Avatar `NiraPresence` inalterado (já usa o SVG com halo).

## 8. Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `app/globals.css` | Tokens near-black, micro-ciano, utilitários `.hanira-menu`, `.waveform`, `.nira-mark`, `.compose-surface.is-recording` + keyframes |
| `components/brand/hanira-mark.tsx` | Logo SVG com glow radial (sem tile quadrado) |
| `components/chat/chat-composer.tsx` | Menu `+`, remove "Criar imagem", microfone inline, gravação na superfície |
| `components/voice/voice-recorder.tsx` | Novo modo `inline` com waveform + auto-start; modo card preservado |
| `components/chat/sidebar.tsx` | Refinamento visual (nova conversa, conversa ativa) |
| `components/chat/chat-interface.tsx` | Branding do cabeçalho |
| `tests/single-composer.test.ts` | Teste do botão "Criar imagem" atualizado para intenção de texto |
| `tests/visual-refresh-18-3-5.test.ts` | Novo teste dos contratos 18.3.5 |

## 9. Validação

- **Testes:** `vitest run` → 976 passed / 7 skipped / 0 failed.
- **Typecheck:** PASS (`tsc --noEmit`).
- **Build:** PASS (`next build`).
- **`git diff --check`:** PASS.
- **Provider calls:** 0. Sem billing, migration, schema, Vercel config ou deploy.

## 10. Limitações

- **Waveform simulada:** a visualização de áudio é animação CSS leve (não lê a
  amplitude real do microfone via `AnalyserNode`). Uma waveform real exporia o
  `MediaStream` no hook `use-media-recorder` compartilhado — adiado para não
  arriscar o STT implantado.
- **Logo:** `hanira-symbol.svg` é o melhor asset existente (vetorial). Não havia
  versão "sem fundo" alternativa a priorizar; o container agora usa glow radial,
  evitando o aspeto de quadrado. Nenhum asset externo foi inventado.
- Produção permanece **fail-closed / desativada** — este pacote não toca gates de
  produção.

## 11. Workflow

- Branch nova criada a partir de `main`; commit nesta branch; push apenas da branch.
- Sem PR automático, sem merge, sem push em `main`, sem deploy manual.
