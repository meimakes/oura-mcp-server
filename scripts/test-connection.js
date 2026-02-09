#!/usr/bin/env node

/**
 * Test Connection Script
 *
 * Verifica se o servidor MCP está funcionando corretamente
 * e se a autenticação OAuth está ativa
 */

const https = require('https');

const CONFIG = {
  serverUrl: 'web-production-8ca97.up.railway.app',
  authToken: '1d91dd1934cf4f51f1ddba7047686abed1aef3bdf3d9d087d4334192c7a231cb'
};

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.serverUrl,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${CONFIG.authToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (err) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testConnection() {
  console.log('\n🔵 Testando Conexão com Oura MCP Server');
  console.log('=========================================\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣  Testando Health Check...');
    const healthResponse = await makeRequest('/health');
    if (healthResponse.status === 200) {
      console.log('   ✅ Servidor está online');
      console.log(`   📊 Cache size: ${healthResponse.data.cache_size}`);
      console.log(`   ⏱️  Uptime: ${Math.round(healthResponse.data.uptime / 60)}min`);
    } else {
      console.log('   ❌ Falha no health check');
    }

    // Test 2: OAuth Status
    console.log('\n2️⃣  Testando OAuth Status...');
    const oauthResponse = await makeRequest('/oauth/status');
    if (oauthResponse.status === 200) {
      if (oauthResponse.data.connected) {
        console.log('   ✅ OAuth conectado');
        console.log(`   👤 Usuário: ${oauthResponse.data.user_info?.email || 'N/A'}`);
      } else {
        console.log('   ⚠️  OAuth não conectado');
        console.log('   💡 Visite: https://web-production-8ca97.up.railway.app/oauth/authorize');
      }
    } else {
      console.log('   ❌ Falha ao verificar OAuth');
    }

    // Test 3: MCP Tools List
    console.log('\n3️⃣  Testando MCP Tools...');
    const toolsResponse = await makeRequest('/sse', 'POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });

    if (toolsResponse.status === 200 && toolsResponse.data.result) {
      const tools = toolsResponse.data.result.tools || [];
      console.log(`   ✅ ${tools.length} ferramentas disponíveis:`);
      tools.forEach(tool => {
        console.log(`      • ${tool.name}`);
      });
    } else {
      console.log('   ❌ Falha ao listar ferramentas');
    }

    // Test 4: Sample Data Fetch
    console.log('\n4️⃣  Testando Busca de Dados...');
    const today = new Date().toISOString().split('T')[0];
    const dataResponse = await makeRequest('/sse', 'POST', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_personal_info',
        arguments: {}
      }
    });

    if (dataResponse.status === 200 && dataResponse.data.result) {
      console.log('   ✅ Dados pessoais recuperados com sucesso');
      try {
        const content = JSON.parse(dataResponse.data.result.content[0].text);
        console.log(`      Idade: ${content.age || 'N/A'}`);
        console.log(`      Email: ${content.email || 'N/A'}`);
      } catch (e) {
        console.log('      (Dados disponíveis mas não exibidos)');
      }
    } else {
      console.log('   ❌ Falha ao buscar dados');
    }

    console.log('\n=========================================');
    console.log('✅ Teste de conexão concluído!\n');

  } catch (error) {
    console.error('\n❌ Erro durante teste:', error.message);
    process.exit(1);
  }
}

testConnection();
