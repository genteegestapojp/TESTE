// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/api/proxy.js
//RRRARA
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

// O endpoint recebe o nome da tabela (ex: 'expeditions') e repassa a chamada.
export default async (req, res) => {
    // 1. Extrair o endpoint (nome da tabela)
    const { endpoint } = req.query; 

    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    // 2. Montar a URL de destino (base Supabase REST)
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    
    // 3. Incluir todos os filtros de query do cliente (ex: status=eq.entregue)
    const searchParams = new URLSearchParams(req.url.split('?')[1]);
    searchParams.delete('endpoint'); // Remove o nosso parâmetro interno
    
    // 🚨 FIX CRÍTICO: Remove filtros de filial para requisições de escrita/exclusão (POST, PATCH, PUT, DELETE) 🚨
    // Isso evita o erro 500 no DELETE e o conflito de coluna 'nome_filial'.
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT' || req.method === 'DELETE') {
        searchParams.delete('filial'); 
        searchParams.delete('nome_filial'); 
    }

    const fullUrl = `${url}?${searchParams.toString()}`;

    // 4. Configurar as opções da requisição para o Supabase
    const options = {
        method: req.method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Host': undefined, // Evita problemas de cabeçalho de proxy
        },
    };

    // 5. Garantir que o corpo seja uma string JSON válida antes de repassar
    if (req.body && (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT')) {
        let bodyContent = req.body;
        
        if (typeof req.body !== 'string') {
            bodyContent = JSON.stringify(req.body);
        }
        
        options.body = bodyContent;
    }
    
    // 6. Configurar headers de Preferência (para retornar dados e upsert)
    if (req.method === 'POST' && req.query.upsert === 'true') {
         options.headers.Prefer = 'return=representation,resolution=merge-duplicates';
    } else if (req.method !== 'DELETE') {
        options.headers.Prefer = 'return=representation';
    }

    // 7. Executar a requisição e retornar a resposta
    try {
        const response = await fetch(fullUrl, options);
        const responseBody = await response.text(); 
        
        if (!response.ok) {
            let errorJson;
            try {
                errorJson = JSON.parse(responseBody);
            } catch (e) {
                return res.status(response.status).json({ error: responseBody || 'Erro desconhecido do Supabase' });
            }
            return res.status(response.status).json(errorJson);
        }
        
        // CORREÇÃO: O response.text() pode ser vazio (Ex: DELETE sem return=representation), evitar JSON.parse em string vazia
        if (responseBody) {
             return res.status(response.status).json(JSON.parse(responseBody));
        } else {
             // Retorna status 204 No Content para DELETE/PATCH bem-sucedido e sem corpo
             return res.status(response.status).end();
        }
        
    } catch (error) {
        console.error('Erro ao proxear requisição:', error);
        res.status(500).json({ error: 'Falha ao comunicar com o Supabase' });
    }
};
