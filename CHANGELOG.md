# EvoluaX — Últimas alterações

## Novembro 2026

### Despesas duplicadas
- Aviso quando já existe uma despesa com o mesmo valor na mesma data.
- No formulário web: diálogo "Possível despesa duplicada" com opção **Guardar mesmo assim**.
- No bot do Telegram: mensagem com botões para confirmar ou cancelar (confirmação expira em 15 minutos).
- Correção: o bot passou a receber os cliques nos botões.

### Bot do Telegram (@Evoluax_bot)
- Ligação da conta com código de 6 dígitos em **Configurações**.
- Registo rápido por texto, por exemplo `18,50 almoço` ou `750 renda pendente`.
- Leitura de fotos e PDFs de talões/faturas por IA, com a imagem guardada no Google Drive.
- Correção: as fotos são descarregadas diretamente do Telegram, com verificação de tamanho, para nunca ler a imagem errada.

### Nova movimentação
- **Foto da despesa** no topo do formulário, com preenchimento automático por IA (descrição, valor, data, categoria e subcategoria).
- Confirmação com resumo antes de gravar.
- Datas em DD/MM/AAAA; campo **Natureza** removido; campo **Estado** renomeado para **Status**.
- Valores lidos das fotos mostrados sempre com duas casas decimais (ex.: 86,10).

### Configurações
- Submenu com **Categorias**, **Contas** e **Métodos de pagamento**.
- Métodos de pagamento geridos na folha, incluindo "Transferência internacional".
- Lista de **Utilizadores autorizados**; cada utilizador tem a sua própria folha.

### Integrações Google
- Fotos guardadas na pasta do Drive "EvoluaX — Fotos de despesas", com o nome `despesa-AAAA-MM-DD-HHMMSS`.
- Despesas pendentes criam um lembrete na Google Agenda ("descrição - Lembrete de pagamento", com as observações na descrição do evento).

### Dashboard
- Cotações de euro, dólar americano e bitcoin, só para consulta.

### Acesso
- Modo demonstração com dados fictícios, sem conta.
- Sessão mantida após atualizar a página; entrada com Google, Microsoft e Apple.
