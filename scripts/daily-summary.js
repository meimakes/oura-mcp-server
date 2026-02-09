#!/usr/bin/env node

/**
 * Daily Health Summary Script
 *
 * Busca e exibe um resumo diário de saúde do Oura Ring
 * Este script pode ser executado diariamente via cron job
 */

const https = require('https');

const CONFIG = {
  serverUrl: 'web-production-8ca97.up.railway.app',
  authToken: '1d91dd1934cf4f51f1ddba7047686abed1aef3bdf3d9d087d4334192c7a231cb'
};

// Helper para fazer chamadas MCP
function callMCPTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    });

    const options = {
      hostname: CONFIG.serverUrl,
      port: 443,
      path: '/sse',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.authToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

// Função para obter datas
function getDate(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// Função principal
async function getDailySummary() {
  try {
    console.log('\n🔵 Oura Ring - Resumo Diário de Saúde');
    console.log('=====================================\n');

    const today = getDate(0);
    const yesterday = getDate(1);
    const weekAgo = getDate(7);

    console.log(`📅 Data: ${today}\n`);

    // 1. Sono de ontem
    console.log('💤 SONO (última noite):');
    const sleepData = await callMCPTool('get_sleep_summary', {
      start_date: yesterday,
      end_date: yesterday,
      include_hrv: true
    });

    const sleepJson = JSON.parse(sleepData.content[0].text);
    if (sleepJson.data.length > 0) {
      const sleep = sleepJson.data[0];
      console.log(`   Score: ${sleep.score}/100`);
      console.log(`   Duração: ${(sleep.total_sleep_duration / 3600).toFixed(1)}h`);
      console.log(`   Eficiência: ${sleep.efficiency.toFixed(1)}%`);
      console.log(`   Sono Profundo: ${(sleep.deep_sleep_duration / 3600).toFixed(1)}h`);
      console.log(`   Sono REM: ${(sleep.rem_sleep_duration / 3600).toFixed(1)}h`);
      if (sleep.hrv_average_ms) {
        console.log(`   HRV Média: ${sleep.hrv_average_ms.toFixed(0)}ms`);
      }
    } else {
      console.log('   Dados não disponíveis');
    }

    // 2. Readiness de hoje
    console.log('\n⚡ PRONTIDÃO (hoje):');
    const readinessData = await callMCPTool('get_readiness_score', {
      start_date: today,
      end_date: today
    });

    const readinessJson = JSON.parse(readinessData.content[0].text);
    if (readinessJson.data.length > 0) {
      const readiness = readinessJson.data[0];
      console.log(`   Score: ${readiness.score}/100`);
      console.log(`   FC Repouso: ${readiness.resting_heart_rate} bpm`);
      console.log(`   HRV Balance: ${readiness.hrv_balance}/100`);
      console.log(`   Recuperação: ${readiness.recovery_index}/100`);
      console.log(`   Balanço Atividade: ${readiness.activity_balance}/100`);
    } else {
      console.log('   Dados não disponíveis (aguardando sincronização)');
    }

    // 3. Atividade de ontem
    console.log('\n🏃 ATIVIDADE (ontem):');
    const activityData = await callMCPTool('get_activity_summary', {
      start_date: yesterday,
      end_date: yesterday
    });

    const activityJson = JSON.parse(activityData.content[0].text);
    if (activityJson.data.length > 0) {
      const activity = activityJson.data[0];
      console.log(`   Score: ${activity.score}/100`);
      console.log(`   Passos: ${activity.steps.toLocaleString()}`);
      console.log(`   Calorias: ${activity.total_calories} kcal`);
      console.log(`   Atividade Alta: ${Math.round(activity.high_activity_time / 60)}min`);
      console.log(`   Atividade Média: ${Math.round(activity.medium_activity_time / 60)}min`);
    } else {
      console.log('   Dados não disponíveis');
    }

    // 4. Insights da semana
    console.log('\n💡 INSIGHTS (últimos 7 dias):');
    const insightsData = await callMCPTool('get_health_insights', {
      days: 7
    });

    const insightsJson = JSON.parse(insightsData.content[0].text);
    console.log(`   Tendência Sono: ${insightsJson.trends.sleep}`);
    console.log(`   Tendência Atividade: ${insightsJson.trends.activity}`);
    console.log(`   Tendência Prontidão: ${insightsJson.trends.readiness}`);

    if (insightsJson.insights.length > 0) {
      console.log('\n   Recomendações:');
      insightsJson.insights.forEach((insight, i) => {
        console.log(`   ${i + 1}. [${insight.category.toUpperCase()}] ${insight.recommendation}`);
      });
    }

    // 5. Comparação com a semana
    console.log('\n📊 COMPARAÇÃO SEMANAL:');
    const weekSleepData = await callMCPTool('get_sleep_summary', {
      start_date: weekAgo,
      end_date: yesterday,
      include_hrv: false
    });

    const weekSleepJson = JSON.parse(weekSleepData.content[0].text);
    console.log(`   Média Score Sono: ${weekSleepJson.summary.average_score.toFixed(0)}/100`);
    console.log(`   Média Duração: ${weekSleepJson.summary.average_duration_hours.toFixed(1)}h/noite`);
    console.log(`   Média Eficiência: ${weekSleepJson.summary.average_efficiency.toFixed(1)}%`);

    console.log('\n=====================================');
    console.log(`✅ Resumo gerado com sucesso!\n`);

  } catch (error) {
    console.error('\n❌ Erro ao gerar resumo:', error.message);
    process.exit(1);
  }
}

// Executar
getDailySummary();
