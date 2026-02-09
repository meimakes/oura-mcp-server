# Oura MCP Server - Configuração Claude

Este repositório contém um servidor MCP que conecta o Oura Ring ao Claude através do Model Context Protocol.

## 🔵 Servidor MCP Ativo

**URL do Servidor**: https://web-production-8ca97.up.railway.app
**Status**: ✅ Ativo no Railway
**OAuth Oura**: ✅ Conectado

## 🔌 Configuração de Conexão

### Para Claude Desktop/Code

Adicione ao seu arquivo de configuração MCP:

```json
{
  "mcpServers": {
    "oura": {
      "url": "https://web-production-8ca97.up.railway.app/sse",
      "transport": {
        "type": "sse"
      },
      "headers": {
        "Authorization": "Bearer 1d91dd1934cf4f51f1ddba7047686abed1aef3bdf3d9d087d4334192c7a231cb"
      }
    }
  }
}
```

### Para Poke App

1. Settings → Integrations → Add Integration
2. Select "Model Context Protocol (MCP)"
3. **Server URL**: `https://web-production-8ca97.up.railway.app/sse`
4. **API Key**: `1d91dd1934cf4f51f1ddba7047686abed1aef3bdf3d9d087d4334192c7a231cb`

## 📊 Ferramentas Disponíveis

Quando conectado, Claude terá acesso a 9 ferramentas de saúde:

### 1. `get_personal_info`
Obtém informações pessoais e detalhes do anel Oura.

**Exemplo de uso**:
```
"Me mostre minhas informações pessoais do Oura"
```

### 2. `get_sleep_summary`
Obtém dados de sono para um período específico.

**Parâmetros**:
- `start_date` (obrigatório): Data no formato YYYY-MM-DD
- `end_date` (opcional): Data no formato YYYY-MM-DD
- `include_hrv` (opcional): boolean para incluir dados de HRV

**Exemplos de uso**:
```
"Como foi meu sono ontem?"
"Me mostre meus dados de sono dos últimos 7 dias com HRV"
"Qual foi minha eficiência de sono esta semana?"
```

### 3. `get_readiness_score`
Obtém pontuações de prontidão diária.

**Parâmetros**:
- `start_date` (obrigatório): Data no formato YYYY-MM-DD
- `end_date` (opcional): Data no formato YYYY-MM-DD

**Exemplos de uso**:
```
"Qual é minha pontuação de prontidão hoje?"
"Como está minha recuperação esta semana?"
"Me mostre meu readiness dos últimos 30 dias"
```

### 4. `get_activity_summary`
Obtém dados de atividade (passos, calorias, tempo de atividade).

**Parâmetros**:
- `start_date` (obrigatório): Data no formato YYYY-MM-DD
- `end_date` (opcional): Data no formato YYYY-MM-DD

**Exemplos de uso**:
```
"Quantos passos dei hoje?"
"Me mostre minha atividade desta semana"
"Qual foi meu total de calorias queimadas este mês?"
```

### 5. `get_heart_rate`
Obtém dados de frequência cardíaca em intervalos de 5 minutos.

**Parâmetros**:
- `start_datetime` (obrigatório): Datetime no formato ISO 8601
- `end_datetime` (opcional): Datetime no formato ISO 8601

**Exemplos de uso**:
```
"Me mostre minha frequência cardíaca das últimas 24 horas"
"Qual foi minha FC mínima durante o sono de ontem?"
"Analise minha variação de FC hoje"
```

### 6. `get_workouts`
Obtém sessões de treino registradas.

**Parâmetros**:
- `start_date` (obrigatório): Data no formato YYYY-MM-DD
- `end_date` (opcional): Data no formato YYYY-MM-DD

**Exemplos de uso**:
```
"Quais treinos fiz esta semana?"
"Me mostre minhas sessões de exercício do último mês"
"Quantas calorias queimei nos treinos desta semana?"
```

### 7. `get_sleep_detailed`
Obtém dados detalhados de sono com HRV e frequência cardíaca.

**Parâmetros**:
- `start_date` (obrigatório): Data no formato YYYY-MM-DD
- `end_date` (opcional): Data no formato YYYY-MM-DD

**Exemplos de uso**:
```
"Me dê os detalhes completos do meu sono de ontem"
"Analise minha HRV durante o sono desta semana"
"Como foi meu sono profundo e REM nos últimos 3 dias?"
```

### 8. `get_tags`
Obtém tags e notas criadas pelo usuário.

**Parâmetros**:
- `start_date` (obrigatório): Data no formato YYYY-MM-DD
- `end_date` (opcional): Data no formato YYYY-MM-DD

**Exemplos de uso**:
```
"Quais tags criei esta semana?"
"Me mostre minhas notas dos últimos 30 dias"
```

### 9. `get_health_insights`
Obtém insights de IA baseados em dados recentes.

**Parâmetros**:
- `days` (opcional): Número de dias para análise (padrão: 7)

**Exemplos de uso**:
```
"Me dê insights sobre minha saúde esta semana"
"Como está minha recuperação baseado nos últimos 14 dias?"
"Analise meus padrões de saúde do último mês"
```

## 💡 Exemplos de Perguntas que Funcionam

### Análise Diária
- "Como foi minha noite de sono?"
- "Estou pronto para treinar hoje?"
- "Quantos passos dei hoje?"
- "Qual é minha pontuação de readiness?"

### Análise de Tendências
- "Como está minha qualidade de sono esta semana?"
- "Minha recuperação melhorou no último mês?"
- "Estou cumprindo minhas metas de atividade?"
- "Como está minha HRV comparada à semana passada?"

### Análise Detalhada
- "Analise meu sono REM dos últimos 7 dias"
- "Como está minha frequência cardíaca em repouso?"
- "Há correlação entre meu sono e readiness?"
- "Quais dias tive melhor recuperação?"

### Insights e Recomendações
- "Me dê insights sobre minha saúde este mês"
- "O que devo melhorar baseado nos meus dados?"
- "Estou overtraining?"
- "Como posso melhorar minha recuperação?"

## 🔄 Uso Simultâneo

Este servidor suporta **múltiplos clientes simultâneos** de forma segura:
- ✅ Todas as operações são **read-only** (somente leitura)
- ✅ Cache compartilhado reduz chamadas à API do Oura
- ✅ Sem interferência entre diferentes clientes
- ✅ Rate limiting inteligente protege contra sobrecarga

## 📝 Formato de Datas

- **Datas**: Use formato `YYYY-MM-DD` (ex: `2024-02-09`)
- **Datetimes**: Use formato ISO 8601 (ex: `2024-02-09T10:00:00Z`)
- Para "hoje", "ontem", etc., Claude converterá automaticamente

## 🔒 Segurança

- ✅ Autenticação via Bearer token
- ✅ Tokens OAuth criptografados com AES-256-GCM
- ✅ Rate limiting: 100 req/15min por IP
- ✅ HTTPS obrigatório em produção
- ✅ CORS configurado

## 📊 Monitoramento

### Health Check (requer autenticação)
```bash
curl -H "Authorization: Bearer 1d91dd1934cf4f51f1ddba7047686abed1aef3bdf3d9d087d4334192c7a231cb" \
  https://web-production-8ca97.up.railway.app/health
```

### OAuth Status
```bash
curl -H "Authorization: Bearer 1d91dd1934cf4f51f1ddba7047686abed1aef3bdf3d9d087d4334192c7a231cb" \
  https://web-production-8ca97.up.railway.app/oauth/status
```

## 🚀 Updates Diários Automáticos

Para receber updates diários automáticos, você pode:

1. **Usar Poke** - Configure notificações diárias
2. **Criar um script** - Use cron job para buscar dados
3. **Integração com Claude** - Pergunte diariamente sobre suas métricas

### Exemplo de Script Diário (Node.js)

```javascript
const fetch = require('node-fetch');

async function getDailySummary() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const response = await fetch('https://web-production-8ca97.up.railway.app/sse', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer 1d91dd1934cf4f51f1ddba7047686abed1aef3bdf3d9d087d4334192c7a231cb',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_sleep_summary',
        arguments: {
          start_date: yesterday,
          end_date: today,
          include_hrv: true
        }
      }
    })
  });

  const data = await response.json();
  console.log(data);
}

getDailySummary();
```

## 📖 Documentação Adicional

- [README.md](./README.md) - Documentação completa do servidor
- [Oura API Docs](https://cloud.ouraring.com/docs) - Documentação oficial da API
- [MCP Protocol](https://modelcontextprotocol.io) - Especificação do protocolo

## 🆘 Troubleshooting

### "OAuth não conectado"
Visite: https://web-production-8ca97.up.railway.app/oauth/authorize

### "Token inválido"
Verifique se o AUTH_TOKEN está correto nas variáveis de ambiente do Railway

### "Rate limit exceeded"
Aguarde 15 minutos ou reduza a frequência de requisições

### "Dados incompletos"
Certifique-se de que seu Oura Ring está sincronizado com o app
