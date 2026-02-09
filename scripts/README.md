# 🔧 Scripts Utilitários do Oura MCP Server

Scripts auxiliares para testar e interagir com seu servidor MCP do Oura Ring.

## 📋 Scripts Disponíveis

### 1. `test-connection.js`
Testa a conexão com o servidor MCP e verifica se tudo está funcionando.

**Como usar:**
```bash
node scripts/test-connection.js
```

**O que testa:**
- ✅ Health check do servidor
- ✅ Status da conexão OAuth
- ✅ Listagem de ferramentas MCP
- ✅ Busca de dados de exemplo

---

### 2. `daily-summary.js`
Gera um resumo diário completo de saúde com dados do Oura Ring.

**Como usar:**
```bash
node scripts/daily-summary.js
```

**O que mostra:**
- 💤 Sono da última noite (score, duração, HRV)
- ⚡ Prontidão de hoje (readiness, FC repouso)
- 🏃 Atividade de ontem (passos, calorias)
- 💡 Insights da semana
- 📊 Comparação semanal

**Exemplo de output:**
```
🔵 Oura Ring - Resumo Diário de Saúde
=====================================

📅 Data: 2024-02-09

💤 SONO (última noite):
   Score: 85/100
   Duração: 7.5h
   Eficiência: 92.3%
   Sono Profundo: 1.8h
   Sono REM: 2.1h
   HRV Média: 45ms

⚡ PRONTIDÃO (hoje):
   Score: 78/100
   FC Repouso: 58 bpm
   HRV Balance: 82/100
   Recuperação: 75/100
```

---

## 🤖 Automação com Cron

Você pode configurar esses scripts para rodar automaticamente usando cron jobs.

### Exemplo: Resumo diário às 8h da manhã

```bash
# Editar crontab
crontab -e

# Adicionar linha:
0 8 * * * cd /home/user/oura-mcp-server && node scripts/daily-summary.js > ~/oura-daily-$(date +\%Y\%m\%d).log 2>&1
```

### Exemplo: Enviar resumo por email

```bash
0 8 * * * cd /home/user/oura-mcp-server && node scripts/daily-summary.js | mail -s "Resumo Diário Oura" seu@email.com
```

---

## 🔒 Segurança

⚠️ **IMPORTANTE**: Estes scripts contêm seu `AUTH_TOKEN` hardcoded.

**Para produção, use variáveis de ambiente:**

```javascript
const CONFIG = {
  serverUrl: process.env.OURA_MCP_URL || 'web-production-8ca97.up.railway.app',
  authToken: process.env.OURA_MCP_TOKEN
};
```

**Executar com variável de ambiente:**
```bash
OURA_MCP_TOKEN="seu_token_aqui" node scripts/daily-summary.js
```

---

## 🔌 Integração com Outros Serviços

### Slack Webhook
Envie resumo diário para canal Slack:

```javascript
const https = require('https');

async function sendToSlack(summary) {
  const webhookUrl = 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL';

  const payload = {
    text: `🔵 Resumo Oura Ring\n${summary}`
  };

  // ... código para enviar webhook
}
```

### Discord Webhook
Envie para servidor Discord:

```javascript
const webhookUrl = 'https://discord.com/api/webhooks/YOUR/WEBHOOK';
// Similar ao Slack
```

### Notion API
Salve dados em página Notion:

```javascript
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function saveToNotion(data) {
  await notion.pages.create({
    parent: { database_id: process.env.NOTION_DB_ID },
    properties: {
      'Date': { date: { start: new Date().toISOString() } },
      'Sleep Score': { number: data.sleepScore },
      // ... mais campos
    }
  });
}
```

---

## 📊 Análise Avançada

### Exportar para CSV

Crie um script para exportar dados históricos:

```javascript
const fs = require('fs');

async function exportToCSV(startDate, endDate) {
  const data = await callMCPTool('get_sleep_summary', {
    start_date: startDate,
    end_date: endDate
  });

  const json = JSON.parse(data.content[0].text);

  // Criar CSV
  const csv = json.data.map(d =>
    `${d.date},${d.score},${d.total_sleep_duration/3600},${d.efficiency}`
  ).join('\n');

  fs.writeFileSync('oura-data.csv', `Date,Score,Duration (h),Efficiency\n${csv}`);
}
```

---

## 🆘 Troubleshooting

### Erro: "ECONNREFUSED"
- Verifique se o servidor Railway está online
- Teste o URL no navegador: https://web-production-8ca97.up.railway.app

### Erro: "Unauthorized"
- Verifique se o `AUTH_TOKEN` está correto
- Confirme que não há espaços extras no token

### Erro: "OAuth not connected"
- Visite: https://web-production-8ca97.up.railway.app/oauth/authorize
- Faça login e autorize o app

### Dados não disponíveis
- Sincronize seu Oura Ring com o app oficial
- Aguarde alguns minutos para processamento
- Dados do dia atual podem não estar completos até o próximo dia

---

## 💡 Dicas

1. **Cache**: O servidor tem cache de 5 minutos, então requisições repetidas são rápidas
2. **Rate Limit**: Limite de 100 req/15min por IP - use com moderação
3. **Horário**: Dados de sono ficam disponíveis algumas horas após acordar
4. **Múltiplos Clientes**: Você pode usar Poke + estes scripts simultaneamente
5. **Backup**: Considere exportar dados históricos periodicamente

---

## 📚 Recursos Adicionais

- [Oura API Documentation](https://cloud.ouraring.com/docs)
- [MCP Protocol Spec](https://modelcontextprotocol.io)
- [Repository README](../README.md)
- [Claude Configuration](../CLAUDE.md)
