# Pacote 20.0-D.9 — revisão e homologação

> Histórico da primeira entrega. O vídeo e os diagnósticos foram atualizados em [Ajustes D.9](pacote-20-0-d-9-ajustes.md), que descreve o comportamento e a homologação atuais.

Data: 2 de novembro de 2026. Branch: `feature/20-0-d-9-ikigai-fix-visual-nira`.
Base confirmada com fetch: `4e93588373d87fd8e0fa6380fdb446848c0c14be` (`origin/main`, PRs #37 e #38).

## Diagnóstico do Ikigai

**A causa exata do 502 observado em produção ainda não foi comprovada.** Não houve chamada real ao Groq nem acesso a respostas pessoais para reproduzi-la. Build e mocks não homologam o modelo real.

Causas locais reproduzíveis corrigidas:

- O mesmo refinamento bloqueava percentuais psicológicos gerados e citações literais de fatos, como `Ensinar com tecnologia em 20% do meu tempo`. Evidências literais agora têm validação própria; percentuais psicológicos gerados continuam bloqueados.
- `answer.includes(quote)` rejeitava diferenças equivalentes de composição Unicode e espaços. A comparação agora normaliza NFC e espaços, sem aceitar paráfrases ou novos termos.
- O modelo precisava copiar citações exatas, cumprir limites e reconstruir todo o JSON somente por instrução. A nova saída usa IDs de trechos; o servidor resolve esses IDs para citações realmente presentes nas respostas e aplica novamente o contrato público completo.
- Erros de sintaxe, schema e fundamentação eram convertidos no mesmo erro sem diagnóstico. Os logs agora contêm somente a categoria permitida: `json`, `size`, `schema`, `evidence`, `grounding`, `qualification`, `challenge` ou `title`. Não contêm respostas, citações, prompts, saída gerada, objetos Zod ou segredos.
- Timeout de rede/tempo era descrito como limite de tokens. Agora esses eventos têm mensagens distintas.
- A interface aceitava textos arbitrários no campo `error` da API. Agora aceita somente mensagens públicas conhecidas e descarta respostas tardias após cancelamento.

`analysis-output.ts` define o contrato interno; `analysis-contract.ts` continua sendo o contrato público da UI e PDF. O adaptador Groq envia `response_format` com `json_schema`, `strict: true` somente para `openai/gpt-oss-20b` e `openai/gpt-oss-120b`. Outros modelos recebem o contrato no prompt e continuam sujeitos à mesma validação local. O chat comum não recebe essas opções sem opt-in.

Suporte consultado na [documentação oficial de Structured Outputs do Groq](https://console.groq.com/docs/structured-outputs). Schema estrito garante formato, não verdade semântica nem capacidade gratuita disponível.

Mantidos: 8.000 tokens de saída do hotfix anterior, uma chamada por tentativa manual, Zero-Cost Guard, cooldown, autenticação, consentimento separado, quota, cancelamento e preservação das respostas. Não há retry automático, fallback pago, novos serviços ou alteração de credenciais/billing.

Limitações: o vínculo lexical é uma defesa conservadora; não certifica a veracidade semântica de toda interpretação. Pode ainda rejeitar paráfrases legítimas sem palavra temática comum. Entradas sem trechos úteis suficientes, limites gratuitos, interrupção e respostas incompletas continuam podendo falhar com segurança. A qualidade do modelo, a latência e os limites da conta real exigem homologação autorizada.

## Identidade visual

- PNG original: `public/media/ikigai/icons/ikigai-icon-enso-neon.png`.
- SHA-256: `c0f2c58c3bdfe9133eeb86e78fe6a0741824642a168c39ac2c57e68709291c75`.
- Componente: `components/brand/ikigai-icon.tsx`; integração em `components/chat/sidebar.tsx` e `components/ikigai/ikigai-page.tsx`.
- Título e nome acessível: **Ikigai — descubra seu propósito**.
- Complemento: **Explore o que dá sentido à sua vida.**
- Sidebar expandida permite quebra de linha. Recolhida mostra somente o ícone, com tooltip por foco/hover, `title`, nome acessível e navegação `/ikigai`.
- Página inclui a explicação aprovada, recepção estática da Nira, cinco perguntas preservadas e liberação de PDF condicionada à análise pronta. Não reinicia as respostas por alterações visuais.

## Mídias da Nira

Metadados lidos dos próprios arquivos em Chromium, com inspeção visual dos quadros das duas transformações. Todos os vídeos são MP4/H.264 (`avc1`) com faixa AAC (`mp4a`).

| Vídeo original | Dimensões | Duração | Bytes |
| --- | --- | --- | --- |
| `nira-idle-v1.mp4` | 1920 × 1080 | 10 s | 2.607.805 |
| `nira-thinking-v1.mp4` | 1920 × 1080 | 10 s | 3.059.111 |
| `nira-transformation-source-01.mp4` | 1080 × 1920 | 4 s | 3.189.904 |
| `nira-transformation-source-02.mp4` | 1920 × 1080 | 10 s | 6.717.891 |

Escolhido `source-01`: transformação curta do símbolo no retrato da Nira, formato vertical e menor transferência. SHA-256 preservado: `423e80b233597253a68766ccef5f190276fd312643494f6574f23aea1a86ac63`.

Integração: `components/landing/nira-intro.tsx`, no hero de `components/landing/landing-page.tsx`. Desktop coloca a Nira ao lado do texto. Celular usa retrato menor antes do texto e acesso imediato ao chat no cabeçalho. O texto e os links nunca aguardam o vídeo.

Um quadro do próprio vídeo, em 3,95 s, originou `public/media/hanira/images/nira-intro-poster-v1.jpg` (233.599 bytes). Não houve geração de outra personagem nem alteração dos originais.

Vídeo sem loop, sem áudio, `muted`, `playsInline`, `preload="none"`; o `src` só é atribuído após verificar preferência e sessão. `prefers-reduced-motion`, economia de dados e conexão 2G evitam o download automático. Mudança para movimento reduzido durante a reprodução interrompe o vídeo. Rejeição de `play()`, erro e limite de seis segundos restauram a imagem. Pular devolve foco ao CTA. `sessionStorage` guarda somente um marcador de apresentação, sem dados pessoais. Apenas o vídeo escolhido é carregado.

Somente as mídias usadas pelo pacote entram nos commits: ícone, avatar existente da recepção Ikigai, vídeo escolhido e poster derivado. As outras mídias e arquivos locais preexistentes permanecem intactos e não são incluídos automaticamente.

## PDF

O `pdfmake` instalado é 0.3.13. Seus métodos retornam Promises; os callbacks antigos podiam deixar o download pendente. Foram corrigidos `getBlob()`, `getDataUrl()`, tipos, registro VFS e URL absoluta do logo no navegador.

A geração real também revelou canvas maior que a área útil, formas não suportadas (`circle`/`roundRect`), cores de preenchimento incompatíveis e texto claro sobre páginas sem fundo. O documento agora usa fundo explícito, primitivas `ellipse`/`rect`, margens reservadas, diagrama visível, evidências, numeração e proteção contra título isolado no fim da página. As ações são identificadas como 7, 30 e 90 dias.

Teste usa o contrato interno por IDs, valida/hidrata o relatório e gera efetivamente Blob e data URI com o logo oficial e Roboto. O PDF fictício foi aberto no renderizador nativo do Windows e suas cinco páginas foram inspecionadas. Não foram usados arquivos pessoais. Download também foi exercitado no Chromium.

Artefatos locais ficam em `test-results/` (ignorado pelo Git). Para regenerar o PDF de QA:

```powershell
$env:HANIRA_PDF_QA_OUTPUT='1'
npm.cmd exec vitest -- run tests/pdf-validation.test.ts --maxWorkers=1
Remove-Item Env:HANIRA_PDF_QA_OUTPUT
Get-Content -Raw scripts/render-ikigai-qa.ps1 | powershell -NoProfile -Command -
```

O script usa apenas Windows.Data.Pdf; não exige instalação nem altera políticas do Windows. Tamanho pode variar com metadados de criação; a amostra inspecionada tem aproximadamente 1,67 MB.

## Validações

- `npx.cmd tsc --noEmit`.
- `npm.cmd run lint`: nenhum erro; avisos preexistentes fora do código novo.
- `npm.cmd test -- --maxWorkers=1`: 1.309 testes aprovados; 8 ignorados (incluindo o smoke real), 128 arquivos aprovados e 2 ignorados. Inclui saídas curtas, longas e variadas, referências falsas, campos extras/ausentes, consentimento, tokens, timeout, indisponibilidade gratuita, privacidade e geração efetiva de PDF.
- `npm.cmd run build`: build de produção.
- `git diff --check`.
- Playwright: 16 cenários aprovados nos três arquivos `ikigai.spec.ts`, `ikigai-analysis.spec.ts` e `nira-intro.spec.ts`. Cobrem desktop, celular, teclado, sidebar expandida/recolhida, consentimentos, falha/preservação das respostas, cancelamento, download PDF, apresentação por sessão, movimento reduzido, autoplay bloqueado, erro de vídeo e economia de dados.

Os testes de análise no navegador interceptam a API com dados fictícios. O servidor local usa modo demonstração; isso não comprova uma geração real gratuita na Vercel.

## Smoke test real — preparado, não executado

Executar **somente após autorização explícita** para uma chamada gratuita ao Groq. Usa dados fictícios; não registrar conteúdo. Não rodar a suíte inteira com a chave de opt-in habilitada.

```powershell
$env:HANIRA_IKIGAI_LIVE_SMOKE='I_AUTHORIZE_ONE_FREE_REQUEST'
$env:HANIRA_IKIGAI_FREE_QUOTA_CONFIRMED='true'
$env:AI_ENGINE_OLLAMA_ENABLED='false'
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/ikigai-analysis-live-smoke.test.ts --maxWorkers=1
Remove-Item Env:HANIRA_IKIGAI_LIVE_SMOKE
Remove-Item Env:HANIRA_IKIGAI_FREE_QUOTA_CONFIRMED
Remove-Item Env:AI_ENGINE_OLLAMA_ENABLED
```

O teste confirma seleção do Groq antes da geração, usa o runtime protegido existente e deadline de 25 segundos. Se falhar, analisar apenas a categoria segura e os metadados operacionais. Uma nova tentativa exige decisão manual. Depois, homologar no Preview autenticado com consentimento, revisar a personalização e confirmar o PDF antes de qualquer merge em main.

## Entrega

Três grupos de commit: correção funcional e PDF; identidade Ikigai; introdução audiovisual e documentação. Arquivos temporários, `.env`, logs, relatórios antigos e o inventário local preexistente não entram no pacote. Não há merge automático, publicação direta em Production ou integração com EntreUS/Pacote 20.0-E.
