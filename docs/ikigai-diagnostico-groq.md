# Investigação do erro Groq após publicação D.9

O smoke autorizado anteriormente retornou HTTP 400 com `json_validate_failed`; ele não guardou o corpo do provedor, de modo que o motivo específico permanece desconhecido. O teste real segue pendente e não deve ser repetido sem nova autorização explícita para a chamada gratuita.

Foi preparado um diagnóstico **exclusivo do smoke opt-in com dados fictícios**. Ao receber HTTP 400, o teste lê uma cópia da resposta em memória e, caso o provedor forneça `error.failed_generation`, tenta analisar o JSON gerado e sua estrutura estática. O resultado é uma categoria fixa, sem texto, valores, nomes de campos ou caminhos fornecidos pelo provedor. O corpo e a geração não são registrados nem persistidos. Uma estrutura estática válida não comprova a validade dos IDs de evidência específicos nem a fundamentação da análise.

O diagnóstico pode resultar em indisponibilidade do detalhe, JSON inválido ou uma classe de falha estrutural. Não garante que a resposta do provedor traga informações suficientes para identificar a causa. A leitura usa a mesma resposta da única chamada, sem retry ou fallback, e não modifica a aplicação publicada.

Verificações locais: testes simulados do classificador, TypeScript e ESLint. O smoke real permaneceu desativado. A geração e o PDF com análise real ainda precisam de homologação.
