

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

    // 5. Incluir o corpo da requisição para POST/PATCH/DELETE
    if (req.body && (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT')) {
        options.body = req.body; // O body já vem como string/Buffer
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
        // Repassa o status de erro ou sucesso e o JSON do Supabase
        res.status(response.status).json(await response.json());
    } catch (error) {
        console.error('Erro ao proxear requisição:', error);
        res.status(500).json({ error: 'Falha ao comunicar com o Supabase' });
    }
};
