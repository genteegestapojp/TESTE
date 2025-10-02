// NO ARQUIVO: genteegestapojp/teste/TESTE-SA/api/proxy.js

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
    
    // 🚨 CORREÇÃO CRÍTICA DO PROXY 🚨
    // Remove o filtro 'filial' (e o incorreto 'nome_filial') para requisições de ESCRITA
    // para evitar que o Supabase tente aplicá-lo em tabelas que não o suportam (RLS).
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
        searchParams.delete('filial'); 
        searchParams.delete('nome_filial'); 
    }

    const fullUrl = `${url}?${searchParams.toString()}`;

    // 4. Configurar as opções da requisição para o Supabase
    const options = {
        method: req.method,
        headers: {
            // Usa as chaves secretas do Vercel
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Host': undefined, // Evita problemas de cabeçalho de proxy
        },
    };

    // 5. AJUSTE CRÍTICO: Garantir que o corpo seja uma string JSON válida antes de repassar
    if (req.body && (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT')) {
        let bodyContent = req.body;
        
        // Se a Vercel já fez o parse, o body será um objeto JS.
        // Resserializamos para string JSON para o fetch do Supabase.
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
        
        // Tenta ler o body da resposta, mesmo que seja um erro
        const responseBody = await response.text(); 
        
        if (!response.ok) {
            let errorJson;
            try {
                errorJson = JSON.parse(responseBody);
            } catch (e) {
                // Se não for JSON, retorna o erro de texto
                return res.status(response.status).json({ error: responseBody || 'Erro desconhecido do Supabase' });
            }
            // Se for JSON, retorna o JSON de erro do Supabase
            return res.status(response.status).json(errorJson);
        }
        
        // Se for sucesso, retorna o JSON
        return res.status(response.status).json(JSON.parse(responseBody));
        
    } catch (error) {
        console.error('Erro ao proxear requisição:', error);
        res.status(500).json({ error: 'Falha ao comunicar com o Supabase' });
    }
};
