# HANIRA DEV LOCAL — DL-01

Ferramenta privada de desenvolvimento para trabalhar **somente** no repositório Hanira AI com modelos open-weight locais. Não é recurso público da Hanira, nem integração da Nira Cloud. Não há treino de modelo do zero.

## Arquitetura

```text
VS Code → Codex CLI / Cline → Ollama API em localhost → modelo coder local → repo Hanira
```

O agente lê e edita arquivos conforme as permissões da ferramenta. Não entregue a ele tokens cloud, credenciais, `.env` completo ou secrets. Revise o diff antes de aplicar mudanças ou fazer commit.

## Auditoria em 2026-10-10

| Item | Resultado |
| --- | --- |
| Projeto | `C:\Projetos\hanira-app` |
| CPU | Intel Core i5-3470 3.20 GHz, 4 núcleos / 4 threads |
| RAM | 15,9 GiB físicos; ~6,9 GiB livres no momento da execução do doctor |
| GPU | Intel HD Graphics integrada; sem GPU dedicada detectada |
| VRAM | não confirmada; `AdapterRAM` informa ~2,1 GiB compartilhados e **não** equivale a VRAM dedicada |
| Disco livre | C: ~57,0 GiB; D: ~106,6 GiB (valor momentâneo) |
| Windows | 11 Pro, build 22000, x64; PowerShell 5.1.22000.2538 |

| Ferramenta | Estado |
| --- | --- |
| Git | 2.55.0.windows.3 |
| Node / npm | 24.18.0 / 11.16.0 |
| pnpm | não encontrado |
| Python | alias da Microsoft Store; interpretador não instalado |
| Ollama | 0.40.2; instalado |
| Codex CLI | 0.162.0-alpha.2; instalado pela extensão VS Code |
| VS Code | 1.136.1 |
| Cline | extensão `saoudrizwan.claude-dev-4.1.23` presente |
| Modelo Ollama atual | `qwen2.5:7b`, 4,7 GB; modelo geral, não `qwen2.5-coder` |

O `Get-Volume` não retornou unidades nessa sessão; o espaço livre foi confirmado com `Win32_LogicalDisk`. A auditoria não mediu tokens/s nem fez chamada ao modelo.

## Codex local

`codex --help` desta instalação confirma `--oss` e `--local-provider <OSS_PROVIDER>`, com valores `ollama` e `lmstudio`. Assim, **após** aprovação e disponibilidade do modelo, um comando plausível é:

```powershell
codex --oss --local-provider ollama -m qwen2.5-coder:3b -C C:\Projetos\hanira-app -s workspace-write
```

Não foi iniciada uma sessão Codex local neste pacote. O suporte da flag é confirmado pela CLI; compatibilidade e desempenho do modelo ainda exigem teste em DL-03. A extensão Cline está instalada; em DL-03, configurar nela o provider Ollama, endpoint local `http://127.0.0.1:11434` e o nome exato do modelo, conferindo a interface da versão instalada. Não inserir chave cloud ou habilitar fallback cloud.

## Estratégia de modelos

Tamanhos e janelas abaixo são os metadados do [catálogo Qwen2.5-Coder no Ollama](https://ollama.com/library/qwen2.5-coder) e do [Qwen3-Coder](https://ollama.com/library/qwen3-coder). RAM prática e qualidade são **estimativas**, não benchmarks nesta máquina. A janela anunciada é um limite do modelo; não significa que o hardware consiga operá-la integralmente. Começar com contexto de 4K a 8K na máquina atual.

| Perfil | Modelo exato / família | Parâmetros / quantização | Disco | RAM prática mínima estimada | VRAM recomendada | CPU-only | Código / agente | Contexto anunciado | Pontos fortes e limites |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Ultra light | `qwen2.5-coder:1.5b` / Qwen2.5-Coder | ~1,5B / Q4_K_M | ~986 MB | ~4 GiB | nenhuma | SIM | BÁSICO / BÁSICO | 32K | Resposta leve para completar e explicar trechos pequenos; falha mais em refactors e ferramentas encadeadas. |
| B. Balanced | `qwen2.5-coder:3b` / Qwen2.5-Coder | ~3B / Q4_K_M | ~1,9 GB | ~6 GiB | nenhuma | SIM | RAZOÁVEL / BÁSICO | 32K | Melhor escolha inicial para o i5 de 4 threads; útil em mudanças curtas, mas lento em contexto longo e frágil em tarefas autônomas. |
| C. Target upgrade | `qwen3-coder:30b-a3b-q4_K_M` / Qwen3-Coder | ~30B total, ~3,3B ativos / Q4_K_M | ~19 GB | ~32 GiB | 24 GiB dedicada desejável | MUITO LENTO no i5 atual | FORTE / BOM esperado | 256K | Feito para coding agentic e repositórios; precisa de bem mais memória e banda. |
| D. Experimental | `qwen2.5-coder:7b` / Qwen2.5-Coder | ~7B / Q4_K_M | ~4,7 GB | ~10 GiB | 8 GiB dedicada desejável | SIM, LENTO | BOM / RAZOÁVEL | 32K | Qualidade potencialmente melhor que 3B, mas o i5 atual pode tornar o loop de agente pouco prático. |

**HANIRA_DEV_LOCAL_LIGHT:** `qwen2.5-coder:3b`, CPU, contexto inicial 4K–8K; tarefas pequenas, diff revisado, testes pontuais. Alternativa mínima: 1.5B.

**HANIRA_DEV_LOCAL_FULL:** `qwen3-coder:30b-a3b-q4_K_M`, alvo conceitual com 32–64 GiB RAM, SSD com folga e preferencialmente 24 GiB VRAM dedicada. Não pressupõe compra de GPU; CPU com RAM suficiente continuaria lento. Ajustar contexto depois de medir uso real.

**Recomendação para DL-02:** `qwen2.5-coder:3b` (~1,9 GB de download, ~6 GiB RAM prática). Espera-se experiência razoável em código curto e baixa autonomia agentic. Velocidade provavelmente limitada pelo i5; tokens/s não foram medidos. O `qwen2.5:7b` já instalado pode servir para comparação posterior, mas não substitui um coder especializado. Nenhum modelo foi baixado aqui.

## Operação e segurança

```powershell
npm run dev:local:doctor
npm run dev:local:status
```

Os scripts apenas leem hardware, ferramentas, modelos instalados e porta `127.0.0.1:11434`. Não iniciam Ollama, não consultam modelo, não fazem chamadas cloud nem alteram o sistema. `status` verifica a porta TCP, o que não prova saúde completa da API.

Permissões iniciais do agente: ler/pesquisar source, criar branch, editar nela, executar testes, typecheck, lint, build, `git diff` e `git status`. Proibido automaticamente: push/merge em `main`, exclusão em massa, produção, billing, Vercel Production env, migrations remotas Supabase, exposição de `.env`/secrets, instalação global ou download de modelo grande. A migration 009 está **remota e ativa**; nunca reaplicar.

## Próximos pacotes

| Pacote | Escopo |
| --- | --- |
| DL-01 | Bootstrap, hardware doctor e diagnóstico; sem download |
| DL-02 | Escolha aprovada, instalação se necessária e primeiro modelo local |
| DL-03 | Integração Codex/Cline local |
| DL-04 | Benchmark no repositório |
| DL-05 | Comparação de modelos |
| DL-06 | Segurança e permissões do agente local |
| DL-07 | Perfil opcional para hardware mais forte |

## DL-02 — First Local Model (2026-10-10)

O modelo aprovado `qwen2.5-coder:3b` foi baixado com `ollama pull` e consta em `ollama list` com 1,9 GB. `qwen2.5:7b` permaneceu instalado. Ollama 0.40.2 respondeu apenas em `http://127.0.0.1:11434`; nenhum provider cloud foi chamado. O hardware é o descrito acima (i5-3470, 15,9 GiB RAM, Intel HD Graphics integrada). O contexto de todos os testes foi 4096, `stream:false`, `temperature:0` e limite de 160 tokens gerados.

O smoke local com a função `sum` passou: resposta TypeScript correta; 11,30 s de parede, 10,91 s medidos pelo Ollama, 4,86 s de carregamento, 62 tokens de prompt, 24 gerados e 8,19 tokens/s de geração.

| Teste sintético no Coder 3B | Parede | Carga | Prompt / gerados | Geração | Observação |
| --- | ---: | ---: | ---: | ---: | --- |
| A — geração | 4,90 s | 0,01 s | 55 / 24 | 8,09 tokens/s | Função `sum` correta. |
| B — explicação | 23,92 s | 0,01 s | 69 / 160 | 7,46 tokens/s | Explicação correta, mas excedeu o limite de 3 frases e terminou truncada no limite de geração. |
| C — correção | 18,50 s | 0,01 s | 70 / 131 | 8,21 tokens/s | Tratou divisor zero com exceção e manteve a divisão normal. |
| D — refatoração | 7,77 s | 0,03 s | 91 / 35 | 8,71 tokens/s | Removeu duplicação com expressão condicional clara. |

RAM do sistema **usada** no benchmark: 11,21 GiB antes (modelo já aquecido pelo smoke), 11,26 GiB no máximo **amostrado** após um teste, 11,03 GiB ao final. A amostragem não captura o pico contínuo. O preflight anterior ao download mostrou 7,5 GiB livres, em outro instante.

Na validação final, após carregar também o 7B, o benchmark foi repetido: A 2,83 s / 8,98 tokens/s; B 21,16 s / 8,60 tokens/s; C 4,74 s / 8,94 tokens/s; D 4,31 s / 8,92 tokens/s. A RAM usada foi de 14,28 a 14,33 GiB (máximo amostrado 14,33 GiB). `ollama ps` mostrou **ambos** os modelos carregados em CPU com contexto 4096; portanto a RAM dessa rodada não representa o Coder 3B isolado. A segunda saída C tratou zero retornando `null`, outra escolha segura. A segunda saída D adicionou `Status: ` ao texto retornado e **mudou o comportamento** pedido. B novamente excedeu 3 frases e foi truncado em 160 tokens. Esses erros de aderência impedem classificar a qualidade como consistentemente razoável.

Comparação opcional, somente teste A, com `qwen2.5:7b` já instalado: função correta; 31,74 s de parede, 18,63 s de carga, 55 / 24 tokens, 4,31 tokens/s, RAM usada de 10,86 para 14,71 GiB. A comparação inclui carga fria do 7B contra execução aquecida do 3B; não é benchmark rigoroso de qualidade. Nesta máquina, o 3B foi mais prático para a tarefa curta.

Classificação observada: velocidade **SLOW** para ciclos de agente, qualidade **BASIC** pela falha semântica no refactor e baixa aderência na explicação, potencial agentic **LOW** até testes específicos em DL-03. Este benchmark **não prova equivalência com Codex cloud**. DL-03 pode prosseguir **com limites**, medindo latência e revisando toda edição. Os prompts eram inventados no script; nenhum source real, `.env` ou segredo foi enviado. O [benchmark.ps1](../scripts/dev-local/benchmark.ps1) aceita `-Model`, exige um modelo listado pelo Ollama local, rejeita nomes cloud e usa só localhost. `-OnlyA` executa apenas a geração curta.
