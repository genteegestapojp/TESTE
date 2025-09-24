// Inicializa bibliotecas
AOS.init();
feather.replace();
Chart.register(ChartDataLabels);

// --- INÍCIO DO SCRIPT ADAPTADO ---

// API REST do Supabase e Headers (do sistema original)
const SUPABASE_URL = 'https://owsoweqqttcmuuaohxke.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c293ZXFxdHRjbXV1YW9oeGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMjQ5OTAsImV4cCI6MjA3MTgwMDk5MH0.Iee27SUOIkhMFvgDWXrW3C38DUuMr0MyVtR-NjF6FRk';
const headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };

// Variáveis globais (do sistema original)
let lojas = [], docas = [], lideres = [], veiculos = [], motoristas = [], filiais = [];
let selectedFilial = null;
let currentUser = null; // Para controle de acesso
let cargasDisponiveis = [];
let allExpeditions = [], filteredExpeditions = [];
let allHistorico = [], filteredHistorico = [];
let chartInstances = {};
let html5QrCodeScanner = null;
let scannerIsRunning = false;
let activeTimers = {};
let modalState = { action: null, scannedValue: null, mainId: null, secondaryId: null, expectedCode: null };
let editLojaLineCounter = 0;
let rastreioTimer = null;
let rastreioData = [];
let pontosInteresse = []; // Pontos fixos no mapa
let homeMapInstance = null;
let homeMapTimer = null;

// Função de requisição ao Supabase (do sistema original, adaptada)
async function supabaseRequest(endpoint, method = 'GET', data = null, includeFilialFilter = true) {
    let url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    if (includeFilialFilter && selectedFilial && method === 'GET') {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}filial=eq.${selectedFilial.nome}`;
    }
    const options = { method, headers: { ...headers } };
    
    if (data && (method === 'POST' || method === 'PATCH')) {
        if (includeFilialFilter && selectedFilial) {
            if (Array.isArray(data)) {
                data = data.map(item => ({ ...item, filial: selectedFilial.nome }));
            } else {
                data = { ...data, filial: selectedFilial.nome };
            }
        }
        options.body = JSON.stringify(data);
        if (method !== 'DELETE') {
            options.headers.Prefer = 'return=representation';
        }
    }
    
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`Erro ${response.status}: ${await response.text()}`);
        return method === 'DELETE' ? null : await response.json();
    } catch (error) {
        console.error(`Falha na requisição: ${method} ${url}`, error);
        showNotification(`Erro de comunicação com o servidor: ${error.message}`, 'error');
        throw error;
    }
}

// NOVO: Função de notificação aprimorada
function showNotification(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = '';
    let title = '';
    if (type === 'success') {
        icon = '<i data-feather="check-circle" class="h-5 w-5 mr-2"></i>';
        title = 'Sucesso!';
    } else if (type === 'error') {
        icon = '<i data-feather="x-circle" class="h-5 w-5 mr-2"></i>';
        title = 'Erro!';
    } else if (type === 'info') {
        icon = '<i data-feather="info" class="h-5 w-5 mr-2"></i>';
        title = 'Informação';
    }
    
    notification.innerHTML = `
        <div class="notification-header">
            ${icon}
            <span>${title}</span>
        </div>
        <div class="notification-body">${message}</div>
    `;
    
    container.appendChild(notification);
    feather.replace();

    setTimeout(() => {
        notification.classList.add('hide');
        notification.addEventListener('animationend', () => notification.remove());
    }, timeout);
}

// NOVA: Função de navegação
function showView(viewId, element) {
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if(element) element.classList.add('active');

   // Limpa timers antigos ao trocar de view para não sobrecarregar
    Object.values(activeTimers).forEach(clearInterval);
    activeTimers = {};

    // Limpa timer específico do rastreio
    if (rastreioTimer) {
        clearInterval(rastreioTimer);
        rastreioTimer = null;
    }

    // Limpa timer específico do mapa da home
    if (homeMapTimer) {
        clearInterval(homeMapTimer);
        homeMapTimer = null;
    }

    // Carrega os dados da view selecionada
    switch(viewId) {
        case 'home': loadHomeData(); break;
        case 'transporte': loadTransportList(); break;
        case 'faturamento': loadFaturamento(); break;
        case 'motoristas': loadMotoristaTab(); break;
        case 'acompanhamento': loadAcompanhamento(); break;
        case 'historico': loadHistorico(); break;
        case 'configuracoes': loadConfiguracoes(); break;
        case 'operacao': loadOperacao(); break;
    }
    feather.replace(); // Redesenha os ícones
}

// Carregar filiais (do sistema original)
async function loadFiliais() {
    try {
        const filiaisData = await supabaseRequest('filiais?select=nome,descricao,ativo&ativo=eq.true&order=nome', 'GET', null, false);
        const grid = document.getElementById('filiaisGrid');
        grid.innerHTML = '';
        filiaisData.forEach(filial => {
            const card = document.createElement('div');
            card.className = 'filial-card';
            card.onclick = () => selectFilial(filial);
            card.innerHTML = `<h3>${filial.nome}</h3><p>${filial.descricao || 'Descrição não informada'}</p>`;
            grid.appendChild(card);
        });
        filiais = filiaisData;
    } catch (error) {
        document.getElementById('filiaisGrid').innerHTML = `<p class="text-red-500">Erro ao carregar filiais.</p>`;
    }
}

// Selecionar filial (ADAPTADO)
async function selectFilial(filial) {
    // Busca a filial completa para garantir que temos as coordenadas
    try {
        const fullFilialData = await supabaseRequest(`filiais?nome=eq.${filial.nome}`, 'GET', null, false);
        selectedFilial = fullFilialData[0];
    } catch (error) {
        showNotification('Erro ao carregar dados da filial. Verifique as configurações.', 'error');
        return;
    }
    
    document.getElementById('sidebarFilial').textContent = selectedFilial.nome;
    
    // Esconde a seleção e mostra o sistema principal
    document.getElementById('filialSelectionContainer').style.display = 'none';
    document.getElementById('mainSystem').style.display = 'flex';
    
    // Carrega todos os dados e conteúdos das abas
    await loadAllTabData();
    
    // Carregar pontos de interesse
    await loadPontosInteresse();
    
    // Inicia na view do home
    showView('home', document.querySelector('.nav-item'));
    // Aguardar um pouco e então ativar o auto-refresh
    setTimeout(() => {
        const homeAutoRefreshCheckbox = document.getElementById('homeAutoRefresh');
        if (homeAutoRefreshCheckbox) {
            homeAutoRefreshCheckbox.checked = true;
            toggleHomeAutoRefresh();
        }
    }, 2000);
    showNotification(`Bem-vindo à filial: ${selectedFilial.nome}!`, 'success');
}

// Trocar filial (ADAPTADO)
function trocarFilial() {
    selectedFilial = null;
    currentUser = null;
    // Limpar todos os timers ativos
    Object.values(activeTimers).forEach(clearInterval);
    activeTimers = {};

    if (rastreioTimer) {
        clearInterval(rastreioTimer);
        rastreioTimer = null;
    }

    if (homeMapTimer) {
        clearInterval(homeMapTimer);
        homeMapTimer = null;
    }

    // Limpar mapas
    if (homeMapInstance) {
        homeMapInstance.remove();
        homeMapInstance = null;
    }

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('filialSelectionContainer').style.display = 'block';
}
// NOVO: Carrega o conteúdo das abas originais para as divs de view
async function loadAllTabData() {
    
    document.getElementById('operacao').innerHTML = `
<h1 class="text-3xl font-bold text-gray-800 mb-6">Operação</h1>

<div class="sub-tabs">
    <button class="sub-tab active" onclick="showSubTab('operacao', 'lancamento', this)">Lançamento</button>
    <button class="sub-tab" onclick="showSubTab('operacao', 'identificacao', this)">Identificação</button>
</div>

<div id="lancamento" class="sub-tab-content active">
    <h2 class="text-2xl font-bold text-gray-800 mb-4">Lançamento de Expedição</h2>
    <div class="bg-white p-6 rounded-lg shadow-md max-w-4xl mx-auto">
        <p class="text-sm text-gray-500 mb-4">A data e hora da expedição serão registradas automaticamente no momento do lançamento.</p>
        <form id="expeditionForm">
          <div class="form-grid">
            <div class="form-group">
                <label for="lancar_lojaSelect">Loja:</label>
                <select id="lancar_lojaSelect" class="loja-select" required></select>
            </div>
            <div class="form-group">
                <label for="lancar_docaSelect">Doca de Preparação:</label>
                <select id="lancar_docaSelect" required></select>
            </div>
            <div class="form-group">
                <label for="lancar_palletsInput">Pallets:</label>
                <input type="number" id="lancar_palletsInput" class="pallets-input" min="0" required placeholder="0">
            </div>
            <div class="form-group">
                <label for="lancar_rolltrainersInput">RollTainers:</label>
                <input type="number" id="lancar_rolltrainersInput" class="rolltrainers-input" min="0" required placeholder="0">
            </div>
            <div class="form-group md:col-span-2">
                <label for="lancar_numerosCarga">Números de Carga (separados por vírgula):</label>
                <input type="text" id="lancar_numerosCarga" placeholder="Ex: CG001, CG002, CG003" class="w-full">
                <small class="text-gray-500">Deixe em branco se não houver números específicos</small>
            </div>
            <div class="form-group md:col-span-2">
                 <label for="lancar_liderSelect">Líder Responsável:</label>
                 <select id="lancar_liderSelect" required></select>
            </div>
            <div class="form-group md:col-span-2">
                <label for="lancar_observacoes">Observações:</label>
                <textarea id="lancar_observacoes" placeholder="Observações para esta carga específica..." class="w-full"></textarea>
            </div>
        </div>
        <div class="mt-6 text-center">
            <button type="submit" class="btn btn-primary w-full md:w-auto">Lançar Expedição</button>
        </div>
        </form>
        <div id="operacaoAlert" class="mt-4"></div>
    </div>
</div>

<div id="identificacao" class="sub-tab-content">
    <h2 class="text-2xl font-bold text-gray-800 mb-4">Impressão de Identificação</h2>
    <div class="bg-white p-6 rounded-lg shadow-md">
        <p class="text-sm text-gray-500 mb-4">Expedições aguardando impressão de etiquetas de identificação</p>
        <div id="expedicoesParaIdentificacao" class="loading">
            <div class="spinner"></div>
            Carregando expedições...
        </div>
    </div>
</div>
`;
        
        document.getElementById('transporte').innerHTML = `
            <h1 class="text-3xl font-bold text-gray-800 mb-6">Agrupamento e Alocação de Cargas</h1>
            <div id="availabilityInfo" class="availability-info" style="max-width: 600px; margin: 0 auto 2rem auto;">
                <div class="availability-stat">
                    <div class="stat-number" id="availableVehicles">0</div>
                    <div class="stat-label">Veículos Disponíveis</div>
                </div>
                <div class="availability-stat">
                    <div class="stat-number" id="availableDrivers">0</div>
                    <div class="stat-label">Motoristas Disponíveis</div>
                </div>
            </div>
            
            <div class="transport-card mb-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Cargas Disponíveis para Agrupamento</h3>
                <div id="cargasDisponiveisList" class="loading">
                    <div class="spinner"></div>
                    Carregando cargas...
                </div>
            </div>
            
            <div class="transport-card">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Montar Expedição</h3>
                <div class="stats-grid mb-6">
                    <div class="stat-card" style="background: var(--secondary-gradient);"><div class="stat-number" id="summaryLojas">0</div><div class="stat-label">Lojas</div></div>
                    <div class="stat-card"><div class="stat-number" id="summaryPallets">0</div><div class="stat-label">Pallets</div></div>
                    <div class="stat-card" style="background: var(--accent-gradient);"><div class="stat-number" id="summaryRolls">0</div><div class="stat-label">RollTrainers</div></div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);"><div class="stat-number" id="summaryCargaTotal">0</div><div class="stat-label">Carga Total</div></div>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label for="alocar_veiculoSelect">Selecione o Veículo:</label>
                        <select id="alocar_veiculoSelect" required class="w-full"></select>
                    </div>
                    <div class="form-group">
                        <label for="alocar_motoristaSelect">Selecione o Motorista:</label>
                        <select id="alocar_motoristaSelect" required class="w-full"></select>
                    </div>
                </div>
                <div class="form-group">
                    <label for="alocar_observacoes">Observações da Expedição:</label>
                    <textarea id="alocar_observacoes" placeholder="Observações gerais para a viagem..." class="w-full"></textarea>
                </div>
                <div class="text-center mt-6">
                    <button class="btn btn-primary w-full md:w-auto" onclick="agruparEAlocar()">Agrupar e Alocar Transporte</button>
                </div>
            </div>
        `;
        
        document.getElementById('faturamento').innerHTML = `
<h1 class="text-3xl font-bold text-gray-800 mb-6">Controle de Faturamento</h1>

<div class="sub-tabs">
    <button class="sub-tab active" onclick="showSubTab('faturamento', 'faturamentoAtivo', this)">Faturamento Ativo</button>
    <button class="sub-tab" onclick="showSubTab('faturamento', 'historicoFaturamento', this)">Histórico de Faturamento</button>
</div>

<div id="faturamentoAtivo" class="sub-tab-content active">
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-number" id="totalCarregadas">0</div>
            <div class="stat-label">Aguardando Faturamento</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);">
            <div class="stat-number" id="emFaturamento">0</div>
            <div class="stat-label">Em Faturamento</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #00D4AA, #00B4D8);">
            <div class="stat-number" id="faturadas">0</div>
            <div class="stat-label">Faturadas</div>
        </div>
    </div>

    <div class="time-stats-grid max-w-xs mx-auto">
        <div class="time-stat-card">
            <div class="stat-number" id="tempoMedioFaturamento">-</div>
            <div class="stat-label">Tempo Médio<br>Faturamento (HH:mm)</div>
        </div>
    </div>

    <div id="faturamentoList" class="loading">
        <div class="spinner"></div>
        Carregando expedições...
    </div>
</div>

<div id="historicoFaturamento" class="sub-tab-content">
    <div class="filters-section">
        <h3 class="text-xl font-semibold text-gray-800 mb-4">Filtros de Pesquisa</h3>
        <div class="filters-grid">
            <div class="form-group">
                <label for="historicoFaturamentoDataInicio">Data Início:</label>
                <input type="date" id="historicoFaturamentoDataInicio" onchange="loadHistoricoFaturamento()">
            </div>
            <div class="form-group">
                <label for="historicoFaturamentoDataFim">Data Fim:</label>
                <input type="date" id="historicoFaturamentoDataFim" onchange="loadHistoricoFaturamento()">
            </div>
            <div class="form-group">
                <label for="historicoFaturamentoSearch">Pesquisar:</label>
                <input type="text" id="historicoFaturamentoSearch" placeholder="Buscar por placa, loja..." onkeyup="loadHistoricoFaturamento()">
            </div>
        </div>
        <div class="text-right mt-4">
            <button class="btn btn-primary btn-small" onclick="clearHistoricoFaturamentoFilters()">Limpar Filtros</button>
        </div>
    </div>

    <div class="stats-grid mb-6">
        <div class="stat-card">
            <div class="stat-number" id="historicoTotalFaturadas">0</div>
            <div class="stat-label">Total Faturadas</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #7209B7, #A663CC);">
            <div class="stat-number" id="historicoTempoMedio">00:00</div>
            <div class="stat-label">Tempo Médio Faturamento</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #F77F00, #FCBF49);">
            <div class="stat-number" id="historicoMenorTempo">00:00</div>
            <div class="stat-label">Menor Tempo</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #D62828, #F77F00);">
            <div class="stat-number" id="historicoMaiorTempo">00:00</div>
            <div class="stat-label">Maior Tempo</div>
        </div>
    </div>

    <div class="table-container bg-white rounded-lg shadow-md">
<table class="w-full" style="min-width: 1100px;">
<thead>
    <tr>
        <th>Data</th>
        <th>Placa</th>
        <th>Motorista</th>
        <th>Lojas/Cargas</th>
        <th>Início Faturamento</th>
        <th>Fim Faturamento</th>
        <th>Tempo Faturamento</th>
        <th>Pallets</th>
        <th>RollTrainers</th>
        <th>Ações</th>
    </tr>
</thead>
<tbody id="historicoFaturamentoBody">
    <tr><td colspan="10" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>
</tbody>
            <tbody id="historicoFaturamentoBody">
                <tr><td colspan="9" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>
            </tbody>
        </table>
    </div>
</div>
`;

        // Adicionar event listeners aos formulários
        document.getElementById('expeditionForm').addEventListener('submit', (e) => { e.preventDefault(); lancarCarga(); });
        document.getElementById('editExpeditionForm').addEventListener('submit', (e) => { e.preventDefault(); saveEditedExpedition(); });
        document.getElementById('passwordForm').addEventListener('submit', (e) => { e.preventDefault(); checkPassword(); });
        document.getElementById('addForm').addEventListener('submit', (e) => { e.preventDefault(); handleSave(); });
        // Event listener para o formulário de autenticação de edição
        document.getElementById('authEditForm').addEventListener('submit', (e) => { 
            e.preventDefault(); 
            checkAuthForEdit(); 
        });

        // Carregar dados para os selects
        await loadSelectData();
    }

async function loadSelectData() {
try {
    const [lojasData, docasData, veiculosData, motoristasData, lideresData] = await Promise.all([
        // Ordena lojas por código primeiro, depois por nome
        supabaseRequest('lojas?select=*,codlojaqr,endereco_completo,latitude,longitude&ativo=eq.true&order=codigo,nome'),
        // Ordena docas por nome
        supabaseRequest('docas?ativo=eq.true&order=nome'),
        supabaseRequest('veiculos?order=placa'),
        supabaseRequest('motoristas?order=nome'),
        supabaseRequest('lideres?ativo=eq.true&order=nome')
    ]);
    lojas = lojasData || [];
    docas = docasData || [];
    veiculos = veiculosData || [];
    motoristas = motoristasData || [];
    lideres = lideresData || [];
    populateSelects();
} catch (error) {
    console.error("Erro ao carregar dados dos selects:", error);
}
}

function populateSelects() {
// Ordena lojas por código localmente (garantia extra)
const lojasOrdenadas = [...lojas].sort((a, b) => {
    // Primeiro por código, depois por nome
    if (a.codigo !== b.codigo) {
        return a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });
    }
    return a.nome.localeCompare(b.nome, 'pt-BR');
});

// Ordena docas por nome localmente (garantia extra)
const docasOrdenadas = [...docas].sort((a, b) => 
    a.nome.localeCompare(b.nome, 'pt-BR')
);

// Popula todos os selects de loja
const lojaSelects = document.querySelectorAll('.loja-select');
lojaSelects.forEach(select => {
    select.innerHTML = '<option value="">Selecione a loja</option>';
    lojasOrdenadas.forEach(loja => {
        select.innerHTML += `<option value="${loja.id}">${loja.codigo} - ${loja.nome}</option>`;
    });
});

// Popula selects de doca
['dashboardDocaSelect', 'lancar_docaSelect'].forEach(id => {
    const docaSelect = document.getElementById(id);
    if (docaSelect) {
        docaSelect.innerHTML = '<option value="">Selecione a doca</option>';
        docasOrdenadas.forEach(doca => {
            docaSelect.innerHTML += `<option value="${doca.id}">${doca.nome}</option>`;
        });
    }
});

// Resto da função permanece igual...
['dashboardPlacaSelect', 'placaMotorista'].forEach(id => {
    const placaSelect = document.getElementById(id);
    if(placaSelect) {
        placaSelect.innerHTML = '<option value="">Selecione o veículo</option>';
        veiculos.forEach(v => {
            placaSelect.innerHTML += `<option value="${v.id}">${v.placa} - ${v.modelo}</option>`;
        });
    }
});

['lancar_liderSelect', 'dashboardLiderSelect'].forEach(id => {
    const liderSelect = document.getElementById(id);
    if (liderSelect) {
        liderSelect.innerHTML = '<option value="">Selecione o líder</option>';
        lideres.forEach(lider => {
            liderSelect.innerHTML += `<option value="${lider.id}">${lider.nome}</option>`;
        });
    }
});
}
    
function getStatusLabel(status) {
    const labels = {
        'pendente': 'Pendente', 'aguardando_agrupamento': 'Aguard. Agrupamento', 'aguardando_doca': 'Aguard. Doca',
        'aguardando_veiculo': 'Aguard. Veículo', 'em_carregamento': 'Carregando', 'carregado': 'Carregado',
        'aguardando_faturamento': 'Aguard. Faturamento', 'faturamento_iniciado': 'Faturando', 'faturado': 'Faturado',
        'saiu_para_entrega': 'Saiu p/ Entrega', 'entregue': 'Entregue', 'retornando_cd': 'Retornando CD',
        'cancelado': 'Cancelado', 'disponivel': 'Disponível', 'em_viagem': 'Em Viagem', 'folga': 'Folga',
        'retornando_com_imobilizado': 'Ret. c/ Imobilizado', 'descarregando_imobilizado': 'Desc. Imobilizado',
        'em_uso': 'Em Uso', 'manutencao': 'Manutenção'
    };
    return labels[status] || status.replace(/_/g, ' ');
}

function minutesToHHMM(minutes) {
    if (minutes === null || isNaN(minutes) || minutes < 0) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
// --- Lógica do Home ---
async function loadHomeData() {
    const dataInicioInput = document.getElementById('homeDataInicio');
    const dataFimInput = document.getElementById('homeDataFim');
    const searchInput = document.getElementById('homeSearchInput').value.toLowerCase();

    if (!dataInicioInput.value || !dataFimInput.value) {
        const hoje = new Date().toISOString().split('T')[0];
        dataInicioInput.value = hoje;
        dataFimInput.value = hoje;
    }

    document.getElementById('homeViagensConcluidas').textContent = '...';
    document.getElementById('homeEntregasRealizadas').textContent = '...';
    document.getElementById('homeTempoMedioPatio').textContent = '...';
    document.getElementById('homeOcupacaoMedia').textContent = '...';
    document.getElementById('homeTempoMedioLoja').textContent = '...';
    document.getElementById('temposMediosLojaTbody').innerHTML = `<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>`;

    try {
        const dataInicio = dataInicioInput.value;
        const dataFim = dataFimInput.value;
        let query = `expeditions?status=eq.entregue&data_hora=gte.${dataInicio}T00:00:00&data_hora=lte.${dataFim}T23:59:59&order=data_hora.desc`;
        
        const allExpeditionsInPeriod = await supabaseRequest(query);
        
        if (!allExpeditionsInPeriod || allExpeditionsInPeriod.length === 0) {
             document.getElementById('homeViagensConcluidas').textContent = '0';
            document.getElementById('homeEntregasRealizadas').textContent = '0';
            document.getElementById('homeTempoMedioPatio').textContent = '00:00';
            document.getElementById('homeOcupacaoMedia').textContent = '0%';
            document.getElementById('homeTempoMedioLoja').textContent = '00:00';
            document.getElementById('temposMediosLojaTbody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
            destroyChart('ocupacaoTotalChart');
            destroyChart('lojaDesempenhoChart');
            destroyChart('frotaProdutividadeChart');
            destroyChart('fleetUtilizationChart');
            return;
            initHomeMap(); // Inicializar mapa mesmo sem dados
        }
        
        const expeditionIds = allExpeditionsInPeriod.map(e => e.id);
        const allItemsInPeriod = await supabaseRequest(`expedition_items?expedition_id=in.(${expeditionIds.join(',')})`);
        
        const expToLojaNames = {};
        allItemsInPeriod.forEach(item => {
            if (!expToLojaNames[item.expedition_id]) {
                expToLojaNames[item.expedition_id] = [];
            }
            const loja = lojas.find(l => l.id === item.loja_id);
            if (loja) expToLojaNames[item.expedition_id].push(loja.nome);
        });

        let filteredExpeditions = allExpeditionsInPeriod;
        if (searchInput) {
            filteredExpeditions = allExpeditionsInPeriod.filter(exp => {
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                const searchableMotorista = motorista ? motorista.nome.toLowerCase() : '';
                const searchableLojas = (expToLojaNames[exp.id] || []).join(' ').toLowerCase();
                
                return searchableMotorista.includes(searchInput) || searchableLojas.includes(searchInput);
            });
        }
        
        const filteredExpeditionIds = filteredExpeditions.map(e => e.id);
        const items = allItemsInPeriod.filter(item => filteredExpeditionIds.includes(item.expedition_id));

        if (filteredExpeditions.length === 0) {
             document.getElementById('homeViagensConcluidas').textContent = '0';
            document.getElementById('homeEntregasRealizadas').textContent = '0';
            document.getElementById('homeTempoMedioPatio').textContent = '00:00';
            document.getElementById('homeOcupacaoMedia').textContent = '0%';
            document.getElementById('homeTempoMedioLoja').textContent = '00:00';
            document.getElementById('temposMediosLojaTbody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
            destroyChart('ocupacaoTotalChart');
            destroyChart('lojaDesempenhoChart');
            destroyChart('frotaProdutividadeChart');
            destroyChart('fleetUtilizationChart');
            return;
            initHomeMap(); // Inicializar mapa mesmo sem dados
        }

        const totalViagens = filteredExpeditions.length;
        const totalEntregas = items.length;

        const temposPatio = filteredExpeditions
            .filter(e => e.data_hora && e.data_saida_veiculo)
            .map(e => (new Date(e.data_saida_veiculo) - new Date(e.data_hora)) / 60000);
        const tempoMedioPatio = temposPatio.length > 0 ? temposPatio.reduce((a, b) => a + b, 0) / temposPatio.length : 0;

        const ocupacoes = [];
        let perlogCount = 0;
        let jjsCount = 0;

        filteredExpeditions.forEach(exp => {
            const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
            if (veiculo) {
                if (veiculo.tipo === 'PERLOG') perlogCount++;
                if (veiculo.tipo === 'JJS') jjsCount++;
                
                if (veiculo.capacidade_pallets > 0) {
                    const expItems = items.filter(i => i.expedition_id === exp.id);
                    const totalPallets = expItems.reduce((sum, item) => sum + (item.pallets || 0), 0);
                    const totalRolls = expItems.reduce((sum, item) => sum + (item.rolltrainers || 0), 0);
                    const cargaTotal = totalPallets + (totalRolls / 2);
                    ocupacoes.push((cargaTotal / veiculo.capacidade_pallets) * 100);
                }
            }
        });
        const ocupacaoMedia = ocupacoes.length > 0 ? ocupacoes.reduce((a, b) => a + b, 0) / ocupacoes.length : 0;

        document.getElementById('homeViagensConcluidas').textContent = totalViagens;
        document.getElementById('homeEntregasRealizadas').textContent = totalEntregas;
        document.getElementById('homeTempoMedioPatio').textContent = minutesToHHMM(tempoMedioPatio);
        document.getElementById('homeOcupacaoMedia').textContent = `${ocupacaoMedia.toFixed(1)}%`;

        const temposLojaGeral = [];
        const lojasStats = {};
        const motoristasStats = {};

        items.forEach(item => {
            if (item.data_inicio_descarga && item.data_fim_descarga) {
                const tempo = (new Date(item.data_fim_descarga) - new Date(item.data_inicio_descarga)) / 60000;
                temposLojaGeral.push(tempo);
                
                const lojaId = item.loja_id;
                if (!lojasStats[lojaId]) {
                    const lojaInfo = lojas.find(l => l.id === lojaId);
                    lojasStats[lojaId] = {
                        nome: lojaInfo ? `${lojaInfo.codigo} - ${lojaInfo.nome}` : 'Desconhecida',
                        codigo: lojaInfo ? lojaInfo.codigo : 'N/A',
                        tempos: [],
                        entregas: 0,
                        totalPallets: 0,
                        totalRolls: 0
                    };
                }
                lojasStats[lojaId].tempos.push(tempo);
                lojasStats[lojaId].entregas++;
                lojasStats[lojaId].totalPallets += item.pallets || 0;
                lojasStats[lojaId].totalRolls += item.rolltrainers || 0;
            }
        });

        filteredExpeditions.forEach(exp => {
            if (exp.motorista_id) {
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                if (motorista) {
                    if (!motoristasStats[exp.motorista_id]) {
                        motoristasStats[exp.motorista_id] = {
                            nome: motorista.nome,
                            entregas: 0
                        };
                    }
                    const expItemsCount = items.filter(i => i.expedition_id === exp.id).length;
                    motoristasStats[exp.motorista_id].entregas += expItemsCount;
                }
            }
        });

        const tempoMedioLoja = temposLojaGeral.length > 0 ? temposLojaGeral.reduce((a, b) => a + b, 0) / temposLojaGeral.length : 0;
        document.getElementById('homeTempoMedioLoja').textContent = minutesToHHMM(tempoMedioLoja);

        const lojasData = Object.values(lojasStats).map(loja => ({
            ...loja,
            tempoMedio: loja.tempos.reduce((a, b) => a + b, 0) / loja.tempos.length
        })).sort((a, b) => b.tempoMedio - a.tempoMedio);

        const motoristasData = Object.values(motoristasStats).sort((a, b) => b.entregas - a.entregas);

        renderFrotaProdutividadeChart(motoristasData.slice(0, 5));
        renderOcupacaoTotalChart(ocupacaoMedia);
        renderLojaDesempenhoChart(lojasData.slice(0, 5));
        renderFleetUtilizationChart(perlogCount, jjsCount);
        renderTemposMediosTable(lojasData);
        // Inicializar/atualizar mapa da home
        await initHomeMap();

    } catch (error) {
        console.error("Erro ao carregar dados da home:", error);
        document.getElementById('temposMediosLojaTbody').innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

function renderFleetUtilizationChart(perlogCount, jjsCount) {
    const total = perlogCount + jjsCount;
    if (total === 0) {
        destroyChart('fleetUtilizationChart');
        return;
        initHomeMap(); // Inicializar mapa mesmo sem dados
    }

    const data = {
        labels: ['PERLOG', 'JJS'],
        datasets: [{
            label: 'Nº de Viagens',
            data: [perlogCount, jjsCount],
            backgroundColor: ['#0077B6', '#00D4AA'],
            borderColor: '#fff',
            borderWidth: 2,
        }]
    };

    renderChart('fleetUtilizationChart', 'doughnut', data, {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '50%',
        plugins: {
            legend: {
                position: 'top',
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return ` ${context.label}: ${context.raw} viagens`;
                    }
                }
            },
            datalabels: {
                color: '#fff',
                font: {
                    weight: 'bold',
                    size: 14
                },
                formatter: (value, ctx) => {
                    let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    let percentage = (value * 100 / sum).toFixed(1) + '%';
                    return percentage;
                },
            }
        }
    });
}

function renderOcupacaoTotalChart(ocupacaoPercent) {
    const data = {
        datasets: [{
            data: [ocupacaoPercent, 100 - ocupacaoPercent],
            backgroundColor: ['#0077B6', '#E5E7EB'],
            borderColor: ['#fff'],
            borderWidth: 2,
            circumference: 180,
            rotation: 270,
        }]
    };

    const ocupacaoText = {
        id: 'ocupacaoText',
        beforeDraw(chart) {
            const { ctx, chartArea: { width, height } } = chart;
            ctx.save();
            ctx.font = `bold ${height / 4}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#023047';
            ctx.fillText(`${ocupacaoPercent.toFixed(1)}%`, width / 2, height * 0.85);
            ctx.restore();
        }
    };

    renderChart('ocupacaoTotalChart', 'doughnut', data, {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            datalabels: { display: false }
        }
    }, [ocupacaoText]);
}

function renderFrotaProdutividadeChart(motoristasData) {
    if (!motoristasData || motoristasData.length === 0) {
        destroyChart('frotaProdutividadeChart');
        return;
    }
    const data = {
        labels: motoristasData.map(f => f.nome),
        datasets: [{
            label: 'Total de Entregas',
            data: motoristasData.map(f => f.entregas),
            backgroundColor: '#00D4AA',
            borderColor: '#00B4D8',
            borderWidth: 1,
            borderRadius: 4,
        }]
    };

    renderChart('frotaProdutividadeChart', 'bar', data, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            datalabels: {
                color: '#023047',
                font: { weight: 'bold' },
                anchor: 'end',
                align: 'end',
                offset: -5,
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return `Total de Entregas: ${context.raw}`;
                    }
                }
            }
        },
        scales: {
            y: {
                display: false,
                beginAtZero: true
            },
            x: {
                title: { display: true, text: 'Motorista' }
            }
        }
    });
}

function renderLojaDesempenhoChart(lojasData) {
    if (!lojasData || lojasData.length === 0) {
        destroyChart('lojaDesempenhoChart');
        return;
    }

    const backgroundColors = lojasData.map(loja => 
        loja.nome.toLowerCase().includes('fort') ? 'rgba(239, 68, 68, 0.8)' : '#00B4D8'
    );
    const borderColors = lojasData.map(loja => 
        loja.nome.toLowerCase().includes('fort') ? 'rgba(220, 38, 38, 1)' : '#0077B6'
    );

    const data = {
        labels: lojasData.map(l => l.nome),
        datasets: [{
            label: 'Tempo Médio em Loja',
            data: lojasData.map(l => l.tempoMedio),
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 4
        }]
    };
    
    renderChart('lojaDesempenhoChart', 'bar', data, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            datalabels: {
                color: 'white',
                font: { weight: 'bold' },
                formatter: (value) => minutesToHHMM(value),
                anchor: 'center',
                align: 'center'
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const loja = lojasData[context.dataIndex];
                        return [ `Tempo Médio: ${minutesToHHMM(context.raw)}`, `Total de Entregas: ${loja.entregas}` ];
                    }
                }
            }
        },
        scales: {
            y: {
                display: false,
                beginAtZero: true
            },
            x: {
                title: { display: true, text: 'Loja' }
            }
        }
    });
}

function renderTemposMediosTable(lojasData) {
    const tbody = document.getElementById('temposMediosLojaTbody');
    if (!lojasData || lojasData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum dado de loja encontrado.</td></tr>';
        return;
    }
    tbody.innerHTML = lojasData.map(loja => `
        <tr class="hover:bg-gray-50">
            <td class="py-3 px-4 font-medium text-gray-800">${loja.nome}</td>
            <td class="py-3 px-4 text-center">${loja.entregas}</td>
            <td class="py-3 px-4 text-center">${loja.totalPallets}</td>
            <td class="py-3 px-4 text-center">${loja.totalRolls}</td>
            <td class="py-3 px-4 text-center font-semibold">${minutesToHHMM(loja.tempoMedio)}</td>
        </tr>
    `).join('');
}
// --- FUNÇÕES DO MAPA DA HOME ---
async function initHomeMap() {
    // Destruir mapa existente se houver
    if (homeMapInstance) {
        homeMapInstance.remove();
        homeMapInstance = null;
    }
    
    // Aguardar o elemento estar disponível
    const mapElement = document.getElementById('homeMap');
    if (!mapElement) {
        console.warn('Elemento do mapa da home não encontrado');
        return;
    }
    
    try {
        // Coordenadas do CD da filial selecionada
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        
        // Criar mapa da home
        homeMapInstance = L.map('homeMap').setView(cdCoords, 11);
        
        // Adicionar camada do mapa
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(homeMapInstance);
        
        // Carregar dados do rastreio para o mapa
        await loadHomeMapData();
        
        // Configurar auto-refresh se estiver ativado
        if (document.getElementById('homeAutoRefresh')?.checked) {
            toggleHomeAutoRefresh();
        }
        
    } catch (error) {
        console.error('Erro ao inicializar mapa da home:', error);
        mapElement.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500">
            <div class="text-center">
                <p class="mb-2">Erro ao carregar mapa</p>
                <button class="btn btn-primary btn-small" onclick="initHomeMap()">Tentar Novamente</button>
            </div>
        </div>`;
    }
}

async function loadHomeMapData() {
    if (!homeMapInstance) return;
    
    try {
        // Limpar marcadores existentes
        homeMapInstance.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Circle) {
                homeMapInstance.removeLayer(layer);
            }
        });
        
        // Coordenadas do CD
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        
        // Adicionar marcador do CD
        const cdIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #0077B6; color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏭 CD</div>',
            iconSize: [80, 30],
            iconAnchor: [40, 15]
        });
        
        L.marker(cdCoords, { icon: cdIcon })
            .addTo(homeMapInstance)
            .bindPopup(`<h3><strong>Centro de Distribuição</strong></h3><p>Filial ${selectedFilial.nome}</p>`);
        
        // Carregar dados de rastreio atuais
        const expeditionsEmRota = await supabaseRequest('expeditions?status=eq.saiu_para_entrega&order=data_saida_entrega.desc');
        const motoristasRetornando = await supabaseRequest('motoristas?status=in.(retornando_cd,retornando_com_imobilizado)');
        
        // Buscar localizações GPS
        let locations = [];
        if (expeditionsEmRota.length > 0) {
            const expeditionIds = expeditionsEmRota.map(exp => exp.id);
            const query = `gps_tracking?expedition_id=in.(${expeditionIds.join(',')})&order=data_gps.desc`;
            locations = await supabaseRequest(query, 'GET', null, false);
        }
        
        let returningLocations = [];
        if (motoristasRetornando.length > 0) {
            const motoristaIds = motoristasRetornando.map(m => m.id);
            const query = `gps_tracking?motorista_id=in.(${motoristaIds.join(',')})&order=data_gps.desc`;
            returningLocations = await supabaseRequest(query, 'GET', null, false);
        }
        
        const bounds = L.latLngBounds();
        bounds.extend(cdCoords);
        
        // Adicionar veículos em rota
        expeditionsEmRota.forEach(exp => {
            const location = locations.find(loc => loc.expedition_id === exp.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
                
                // Determinar status do veículo para cor
                let color = '#F59E0B'; // laranja para em trânsito
                let statusText = 'Em Trânsito';
                
                // Verificar se está descarregando (lógica simplificada)
                // Na implementação real, você pode verificar o status atual das entregas
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [60, 20],
                    iconAnchor: [30, 10]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(homeMapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista?.nome || 'N/A'}</p>
                            <p><strong>Status:</strong> <span style="color: ${color};">${statusText}</span></p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar veículos retornando
        motoristasRetornando.forEach(motorista => {
            const location = returningLocations.find(loc => loc.motorista_id === motorista.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const veiculo = veiculos.find(v => v.id === motorista.veiculo_id);
                const color = '#10B981'; // verde para retornando
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [60, 20],
                    iconAnchor: [30, 10]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(homeMapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista.nome}</p>
                            <p><strong>Status:</strong> <span style="color: ${color};">Retornando</span></p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar lojas
        lojas.forEach(loja => {
            if (loja.latitude && loja.longitude && loja.ativo) {
                const lat = parseFloat(loja.latitude);
                const lng = parseFloat(loja.longitude);
                
                let cor = '#10B981'; // verde padrão
                if (loja.nome.toLowerCase().includes('fort')) cor = '#EF4444'; // vermelho
                else if (loja.nome.toLowerCase().includes('comper')) cor = '#0077B6'; // azul
                
                const lojaIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${cor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🏪 ${loja.codigo}</div>`,
                    iconSize: [50, 18],
                    iconAnchor: [25, 9]
                });
                
                L.marker([lat, lng], { icon: lojaIcon })
                    .addTo(homeMapInstance)
                    .bindPopup(`<strong>${loja.nome}</strong><br>Código: ${loja.codigo}`);
                
                bounds.extend([lat, lng]);
            }
        });

        // Adicionar pontos de interesse se existirem
        if (pontosInteresse && pontosInteresse.length > 0) {
            pontosInteresse.forEach(ponto => {
                if (ponto.ativo) {
                    const pontoIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background: ${ponto.cor}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: bold; border: 1px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${ponto.tipo}</div>`,
                        iconSize: [30, 15],
                        iconAnchor: [15, 7]
                    });
                    
                    L.marker([ponto.latitude, ponto.longitude], { icon: pontoIcon })
                        .addTo(homeMapInstance)
                        .bindPopup(`<strong>${ponto.nome}</strong><br><small>${ponto.tipo}</small>`);
                }
            });
        }
        
        // Ajustar zoom para mostrar todos os pontos
        if (bounds.isValid()) {
            homeMapInstance.fitBounds(bounds, { padding: [20, 20] });
        }
        
        // Atualizar timestamp
        updateHomeLastRefreshTime();
        
    } catch (error) {
        console.error('Erro ao carregar dados do mapa da home:', error);
        showNotification('Erro ao atualizar mapa: ' + error.message, 'error');
    }
}

function toggleHomeAutoRefresh() {
    const autoRefresh = document.getElementById('homeAutoRefresh')?.checked;
    
    // Limpar timer existente
    if (homeMapTimer) {
        clearInterval(homeMapTimer);
        homeMapTimer = null;
    }
    
    if (autoRefresh) {
        // Atualizar a cada 30 segundos
        homeMapTimer = setInterval(() => {
            loadHomeMapData();
        }, 30000);
        showNotification('Auto-refresh do mapa ativado (30s)', 'success', 2000);
    } else {
        showNotification('Auto-refresh do mapa desativado', 'info', 2000);
    }
}

function updateHomeLastRefreshTime() {
    const now = new Date();
    const element = document.getElementById('homeLastUpdate');
    if (element) {
        element.textContent = `Última atualização: ${now.toLocaleTimeString('pt-BR')}`;
    }
}

function showHomeMapFullscreen() {
    document.getElementById('mapModalTitle').textContent = 'Visão Geral em Tempo Real - Tela Cheia';
    document.getElementById('mapModal').style.display = 'flex';
    
    setTimeout(async () => {
        if (mapInstance) {
            mapInstance.remove();
        }
        
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        mapInstance = L.map('map').setView(cdCoords, 11);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstance);
        
        // Reutilizar a mesma lógica do mapa da home
        await loadHomeMapDataForFullscreen();
    }, 100);
}

async function loadHomeMapDataForFullscreen() {
    try {
        // Coordenadas do CD
        const cdCoords = [selectedFilial.latitude_cd || -15.6014, selectedFilial.longitude_cd || -56.0979];
        
        // Adicionar marcador do CD
        const cdIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #0077B6; color: white; padding: 8px 16px; border-radius: 10px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">🏭 CD</div>',
            iconSize: [100, 40],
            iconAnchor: [50, 20]
        });
        
        L.marker(cdCoords, { icon: cdIcon })
            .addTo(mapInstance)
            .bindPopup(`<h3><strong>Centro de Distribuição</strong></h3><p>Filial ${selectedFilial.nome}</p>`);
        
        const bounds = L.latLngBounds();
        bounds.extend(cdCoords);
        
        // Carregar dados de rastreio atuais (similar ao loadHomeMapData)
        const expeditionsEmRota = await supabaseRequest('expeditions?status=eq.saiu_para_entrega&order=data_saida_entrega.desc');
        const motoristasRetornando = await supabaseRequest('motoristas?status=in.(retornando_cd,retornando_com_imobilizado)');
        
        // Buscar localizações GPS
        let locations = [];
        if (expeditionsEmRota.length > 0) {
            const expeditionIds = expeditionsEmRota.map(exp => exp.id);
            const query = `gps_tracking?expedition_id=in.(${expeditionIds.join(',')})&order=data_gps.desc`;
            locations = await supabaseRequest(query, 'GET', null, false);
        }
        
        let returningLocations = [];
        if (motoristasRetornando.length > 0) {
            const motoristaIds = motoristasRetornando.map(m => m.id);
            const query = `gps_tracking?motorista_id=in.(${motoristaIds.join(',')})&order=data_gps.desc`;
            returningLocations = await supabaseRequest(query, 'GET', null, false);
        }
        
        // Adicionar veículos em rota (ícones maiores para fullscreen)
        expeditionsEmRota.forEach(exp => {
            const location = locations.find(loc => loc.expedition_id === exp.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const motorista = motoristas.find(m => m.id === exp.motorista_id);
                const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
                
                let color = '#F59E0B'; // laranja para em trânsito
                let statusText = 'Em Trânsito';
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [80, 30],
                    iconAnchor: [40, 15]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(mapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista?.nome || 'N/A'}</p>
                            <p><strong>Status:</strong> <span style="color: ${color}; font-weight: bold;">${statusText}</span></p>
                            <p><strong>Velocidade:</strong> ${location.velocidade || 0} km/h</p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar veículos retornando
        motoristasRetornando.forEach(motorista => {
            const location = returningLocations.find(loc => loc.motorista_id === motorista.id);
            if (location && location.latitude && location.longitude) {
                const lat = parseFloat(location.latitude);
                const lng = parseFloat(location.longitude);
                
                const veiculo = veiculos.find(v => v.id === motorista.veiculo_id);
                const color = '#10B981'; // verde para retornando
                
                const vehicleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${color}; color: white; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">${veiculo?.placa || 'N/A'}</div>`,
                    iconSize: [80, 30],
                    iconAnchor: [40, 15]
                });
                
                L.marker([lat, lng], { icon: vehicleIcon })
                    .addTo(mapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${veiculo?.placa || 'N/A'}</strong></h4>
                            <p><strong>Motorista:</strong> ${motorista.nome}</p>
                            <p><strong>Status:</strong> <span style="color: ${color}; font-weight: bold;">Retornando</span></p>
                            <p><strong>Velocidade:</strong> ${location.velocidade || 0} km/h</p>
                            <p><strong>Última atualização:</strong><br>${new Date(location.data_gps).toLocaleString('pt-BR')}</p>
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar lojas (ícones maiores)
        lojas.forEach(loja => {
            if (loja.latitude && loja.longitude && loja.ativo) {
                const lat = parseFloat(loja.latitude);
                const lng = parseFloat(loja.longitude);
                
                let cor = '#10B981';
                if (loja.nome.toLowerCase().includes('fort')) cor = '#EF4444';
                else if (loja.nome.toLowerCase().includes('comper')) cor = '#0077B6';
                
                const lojaIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background: ${cor}; color: white; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🏪 ${loja.codigo}</div>`,
                    iconSize: [70, 25],
                    iconAnchor: [35, 12]
                });
                
                L.marker([lat, lng], { icon: lojaIcon })
                    .addTo(mapInstance)
                    .bindPopup(`
                        <div style="text-align: center;">
                            <h4><strong>${loja.nome}</strong></h4>
                            <p><strong>Código:</strong> ${loja.codigo}</p>
                            <p><strong>Cidade:</strong> ${loja.cidade}</p>
                            ${loja.endereco_completo ? `<p><strong>Endereço:</strong><br>${loja.endereco_completo}</p>` : ''}
                        </div>
                    `);
                
                bounds.extend([lat, lng]);
            }
        });
        
        // Adicionar pontos de interesse se existirem
        if (pontosInteresse && pontosInteresse.length > 0) {
            pontosInteresse.forEach(ponto => {
                if (ponto.ativo) {
                    const pontoIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background: ${ponto.cor}; color: white; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${ponto.tipo}</div>`,
                        iconSize: [40, 20],
                        iconAnchor: [20, 10]
                    });
                    
                    L.marker([ponto.latitude, ponto.longitude], { icon: pontoIcon })
                        .addTo(mapInstance)
                        .bindPopup(`<strong>${ponto.nome}</strong><br><small>${ponto.tipo}</small>`);
                }
            });
        }
        
        if (bounds.isValid()) {
            mapInstance.fitBounds(bounds, { padding: [30, 30] });
        }
        
    } catch (error) {
        console.error('Erro ao carregar mapa fullscreen:', error);
        showNotification('Erro ao carregar mapa fullscreen: ' + error.message, 'error');
    }
}

// --- FUNCIONALIDADES DA ABA OPERAÇÃO ---
async function lancarCarga() {
    const lojaId = document.getElementById('lancar_lojaSelect').value;
    const docaId = document.getElementById('lancar_docaSelect').value;
    const pallets = parseInt(document.getElementById('lancar_palletsInput').value);
    const rolltrainers = parseInt(document.getElementById('lancar_rolltrainersInput').value);
    const liderId = document.getElementById('lancar_liderSelect').value;
    const numerosCargaInput = document.getElementById('lancar_numerosCarga').value.trim();
    const observacoes = document.getElementById('lancar_observacoes').value;

    if (!lojaId || !liderId || !docaId || (isNaN(pallets) && isNaN(rolltrainers))) {
        showNotification('Preencha Loja, Doca, Líder e ao menos um tipo de carga!', 'error');
        return;
    }
    if ((pallets < 0) || (rolltrainers < 0)) {
        showNotification('As quantidades não podem ser negativas.', 'error');
        return;
    }

    try {
        // Processar números de carga
        let numerosCarga = [];
        if (numerosCargaInput) {
            numerosCarga = numerosCargaInput.split(',').map(num => num.trim()).filter(num => num.length > 0);
        }

        const expeditionData = { 
            data_hora: new Date().toISOString(), 
            lider_id: liderId, 
            doca_id: docaId, 
            observacoes: observacoes || null, 
            status: 'aguardando_agrupamento',
            numeros_carga: numerosCarga.length > 0 ? numerosCarga : null
        };
        
        const expeditionResponse = await supabaseRequest('expeditions', 'POST', expeditionData);
        if (!expeditionResponse || expeditionResponse.length === 0) {
            throw new Error("A criação da expedição falhou e não retornou um ID.");
        }
        const newExpeditionId = expeditionResponse[0].id;

        const itemData = { expedition_id: newExpeditionId, loja_id: lojaId, pallets: pallets || 0, rolltrainers: rolltrainers || 0, status_descarga: 'pendente' };
        await supabaseRequest('expedition_items', 'POST', itemData);

        const lojaNome = lojas.find(l => l.id === lojaId)?.nome || 'Loja';
        const cargasInfo = numerosCarga.length > 0 ? ` (Cargas: ${numerosCarga.join(', ')})` : '';
        showNotification(`Expedição para ${lojaNome}${cargasInfo} lançada com sucesso!`, 'success');

        document.getElementById('expeditionForm').reset();
        document.getElementById('lancar_lojaSelect').focus();
        
        if(document.getElementById('home').classList.contains('active')) {
            await loadHomeData();
        }

    } catch (error) {
        console.error('Erro ao lançar carga:', error);
        showNotification(`Erro ao lançar carga: ${error.message}`, 'error');
    }
}
// --- FUNCIONALIDADES DA ABA TRANSPORTE ---
async function loadTransportList() {
    try {
        const expeditions = await supabaseRequest("expeditions?status=eq.aguardando_agrupamento&order=data_hora.asc");
        if (!expeditions || expeditions.length === 0) {
            renderCargasDisponiveis([], veiculos, motoristas);
            atualizarResumoAgrupamento();
            return;
        }
        const expeditionIds = expeditions.map(exp => exp.id);
        const items = await supabaseRequest(`expedition_items?expedition_id=in.(${expeditionIds.join(',')})`);
        
        document.getElementById('availableVehicles').textContent = veiculos.filter(v => v.status === 'disponivel').length;
        document.getElementById('availableDrivers').textContent = motoristas.filter(m => m.status === 'disponivel').length;

        const expeditionsWithItems = expeditions.map(exp => ({ ...exp, items: items.filter(item => item.expedition_id === exp.id) })).filter(exp => exp.items.length > 0);
        
        renderCargasDisponiveis(expeditionsWithItems, veiculos, motoristas);
        atualizarResumoAgrupamento(); 
    } catch (error) {
        document.getElementById('cargasDisponiveisList').innerHTML = `<div class="alert alert-error">Erro ao carregar cargas: ${error.message}</div>`;
    }
}

function renderCargasDisponiveis(cargas, veiculosList, motoristasList) {
    const container = document.getElementById('cargasDisponiveisList');
    cargasDisponiveis = cargas;

    if (cargas.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Nenhuma carga aguardando agrupamento!</div>';
        return;
    }

    let html = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
    cargas.forEach(carga => {
        const loja = lojas.find(l => l.id === carga.items[0].loja_id);
        const numerosCarga = carga.numeros_carga && carga.numeros_carga.length > 0 ? carga.numeros_carga.join(', ') : null;
        html += `
            <div class="form-group rounded-lg p-3 border border-gray-200 hover:border-blue-400">
                <label for="carga_${carga.id}" class="flex items-center cursor-pointer">
                    <input type="checkbox" id="carga_${carga.id}" value="${carga.id}" onchange="atualizarResumoAgrupamento()" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3">
                    <div>
                        <strong class="text-gray-800">${loja ? `${loja.codigo} - ${loja.nome}` : 'N/A'}</strong><br>
                        ${numerosCarga ? `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mb-1 inline-block">📦 ${numerosCarga}</span><br>` : ''}
                        <span class="text-sm text-gray-500">${carga.items[0].pallets}P + ${carga.items[0].rolltrainers}R | ${new Date(carga.data_hora).toLocaleTimeString('pt-BR')}</span>
                    </div>
                </label>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;

    const veiculoSelect = document.getElementById('alocar_veiculoSelect');
    veiculoSelect.innerHTML = '<option value="">Selecione...</option>';
    veiculosList.filter(v => v.status === 'disponivel').forEach(v => {
        veiculoSelect.innerHTML += `<option value="${v.id}" class="veiculo-option">${v.placa} - ${v.modelo} (Cap: ${v.capacidade_pallets}P)</option>`;
    });

    const motoristaSelect = document.getElementById('alocar_motoristaSelect');
    motoristaSelect.innerHTML = '<option value="">Selecione...</option>';
    motoristasList.filter(m => m.status === 'disponivel').forEach(m => {
        motoristaSelect.innerHTML += `<option value="${m.id}">${m.nome}</option>`;
    });
}

function atualizarResumoAgrupamento() {
    const checkboxes = document.querySelectorAll('#cargasDisponiveisList input[type="checkbox"]:checked');
    let totalLojas = 0, totalPallets = 0, totalRolls = 0;

    document.querySelectorAll('#cargasDisponiveisList .form-group').forEach(group => {
        const checkbox = group.querySelector('input[type="checkbox"]');
        group.classList.toggle('selected', checkbox && checkbox.checked);
    });

    checkboxes.forEach(cb => {
        const carga = cargasDisponiveis.find(c => c.id == cb.value);
        if (carga) {
            totalLojas++;
            totalPallets += carga.items[0].pallets;
            totalRolls += carga.items[0].rolltrainers;
        }
    });

    const cargaTotal = totalPallets + (totalRolls / 2);

    document.getElementById('summaryLojas').textContent = totalLojas;
    document.getElementById('summaryPallets').textContent = totalPallets;
    document.getElementById('summaryRolls').textContent = totalRolls;
    document.getElementById('summaryCargaTotal').textContent = cargaTotal.toFixed(1);

    const veiculoSelect = document.getElementById('alocar_veiculoSelect');
    for (const option of veiculoSelect.options) {
        const veiculo = veiculos.find(v => v.id == option.value);
        if (veiculo) {
            option.classList.toggle('incapacitated', veiculo.capacidade_pallets < cargaTotal);
        }
    }
}

async function agruparEAlocar() {
    const checkboxes = document.querySelectorAll('#cargasDisponiveisList input[type="checkbox"]:checked');
    const veiculoId = document.getElementById('alocar_veiculoSelect').value;
    const motoristaId = document.getElementById('alocar_motoristaSelect').value;
    const observacoes = document.getElementById('alocar_observacoes').value;

    if (checkboxes.length === 0 || !veiculoId || !motoristaId) {
        showNotification('Selecione ao menos uma carga, um veículo e um motorista!', 'error');
        return;
    }

    const idsDasCargas = Array.from(checkboxes).map(cb => cb.value);

    try {
        const cargasSelecionadas = cargasDisponiveis.filter(c => idsDasCargas.includes(String(c.id)));
        const originalDocaIds = [...new Set(cargasSelecionadas.map(c => c.doca_id).filter(id => id))];

        const dockPalletCounts = {};
        cargasSelecionadas.forEach(carga => {
            const docaId = carga.doca_id;
            if (docaId) dockPalletCounts[docaId] = (dockPalletCounts[docaId] || 0) + (carga.items[0]?.pallets || 0);
        });

        const rankedDocks = Object.keys(dockPalletCounts).sort((a, b) => dockPalletCounts[b] - dockPalletCounts[a]);
        const docaAlvoId = rankedDocks.find(docaId => docas.find(d => d.id == docaId)?.status === 'disponivel');

        if (!docaAlvoId) {
            showNotification(`Nenhuma das docas de destino está disponível. Aguarde e tente novamente.`, 'error');
            return;
        }

        const newExpeditionData = { data_hora: new Date().toISOString(), status: 'aguardando_veiculo', doca_id: docaAlvoId, veiculo_id: veiculoId, motorista_id: motoristaId, lider_id: cargasSelecionadas[0].lider_id, data_alocacao_veiculo: new Date().toISOString(), observacoes: observacoes || null };
        const newExpeditionResponse = await supabaseRequest('expeditions', 'POST', newExpeditionData);
        const newExpeditionId = newExpeditionResponse[0].id;

        const itemsToUpdate = cargasSelecionadas.flatMap(c => c.items.map(i => i.id));
        await supabaseRequest(`expedition_items?id=in.(${itemsToUpdate.join(',')})`, 'PATCH', { expedition_id: newExpeditionId });
        await supabaseRequest(`expeditions?id=in.(${idsDasCargas.join(',')})`, 'DELETE');
        
        const updatePromises = [
            supabaseRequest(`veiculos?id=eq.${veiculoId}`, 'PATCH', { status: 'em_uso' }, false),
            supabaseRequest(`motoristas?id=eq.${motoristaId}`, 'PATCH', { status: 'em_viagem' }, false),
            
        ];

        originalDocaIds.forEach(docaId => {
            if (docaId !== docaAlvoId) {
                updatePromises.push(supabaseRequest(`docas?id=eq.${docaId}`, 'PATCH', { status: 'disponivel' }, false));
            }
        });

        await Promise.all(updatePromises);

        showNotification('Expedição montada! Defina a ordem de carregamento.', 'info');
        document.getElementById('alocar_veiculoSelect').value = '';
        document.getElementById('alocar_motoristaSelect').value = '';
        document.getElementById('alocar_observacoes').value = '';

        // Chama o novo modal para definir a ordem
        await openOrdemCarregamentoModal(newExpeditionId);

    } catch (error) {
        showNotification(`Erro ao agrupar: ${error.message}`, 'error');
    }
}

// NOVO: Funções para o Modal de Ordem de Carregamento
async function openOrdemCarregamentoModal(expeditionId) {
    const modal = document.getElementById('ordemCarregamentoModal');
    const list = document.getElementById('ordemLojasList');
    document.getElementById('ordemExpeditionId').value = expeditionId;
    list.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando lojas...</div>`;
    modal.style.display = 'flex';

    try {
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}&select=*,lojas(codigo,nome)`);
        
        if (!items || items.length === 0) {
            showNotification('Nenhum item encontrado para esta expedição.', 'error');
            closeOrdemCarregamentoModal();
            return;
        }

        list.innerHTML = items.map(item => `
            <li draggable="true" data-item-id="${item.id}" class="flex items-center">
                <i data-feather="menu" class="drag-handle"></i>
                <div>
                    <strong class="text-gray-800">${item.lojas.codigo} - ${item.lojas.nome}</strong>
                    <div class="text-sm text-gray-500">${item.pallets} Pallets, ${item.rolltrainers} RollTainers</div>
                </div>
            </li>
        `).join('');

        feather.replace();

        const draggables = list.querySelectorAll('li[draggable="true"]');
        draggables.forEach(draggable => {
            draggable.addEventListener('dragstart', () => {
                draggable.classList.add('dragging');
            });
            draggable.addEventListener('dragend', () => {
                draggable.classList.remove('dragging');
            });
        });

        list.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            const dragging = document.querySelector('.dragging');
            if (!dragging) return;
            if (afterElement == null) {
                list.appendChild(dragging);
            } else {
                list.insertBefore(dragging, afterElement);
            }
        });

    } catch (error) {
        showNotification(`Erro ao carregar itens da expedição: ${error.message}`, 'error');
        closeOrdemCarregamentoModal();
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li[draggable="true"]:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function closeOrdemCarregamentoModal() {
    document.getElementById('ordemCarregamentoModal').style.display = 'none';
    document.getElementById('ordemLojasList').innerHTML = '';
}

async function saveOrdemCarregamento() {
    const expeditionId = document.getElementById('ordemExpeditionId').value;
    const orderedItems = document.querySelectorAll('#ordemLojasList li');

    if (orderedItems.length === 0) {
        showNotification('Nenhuma loja para ordenar.', 'error');
        return;
    }

    const updates = Array.from(orderedItems).map((item, index) => {
        return {
            id: item.dataset.itemId,
            ordem_entrega: index + 1
        };
    });

    try {
        const updatePromises = updates.map(update => {
            const endpoint = `expedition_items?id=eq.${update.id}`;
            const payload = { ordem_entrega: update.ordem_entrega };
            return supabaseRequest(endpoint, 'PATCH', payload, false);
        });

        await Promise.all(updatePromises);

        showNotification('Ordem de carregamento salva com sucesso!', 'success');
        
        closeOrdemCarregamentoModal();
        loadTransportList();
        await loadSelectData(); 
    } catch (error) {
        console.error("Erro completo ao salvar ordem:", error);
    }
}

// Função para renderizar gráficos
function renderChart(canvasId, type, data, options = {}, plugins = []) {
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (ctx) {
        chartInstances[canvasId] = new Chart(ctx, { type, data, options, plugins });
    }
}

function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
}

// Função para mostrar modal de confirmação
async function showYesNoModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('qrModal');
        document.getElementById('qrModalTitle').textContent = "Confirmação";
        document.getElementById('qrModalMessage').innerHTML = message;
        document.getElementById('qr-reader').style.display = 'none';
        
        const confirmBtn = document.getElementById('confirmQrBtn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.textContent = 'Sim';
        newConfirmBtn.disabled = false;
        newConfirmBtn.onclick = () => { closeQrModal(); resolve(true); };

        const cancelBtn = modal.querySelector('.btn-danger');
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.textContent = 'Não';
        newCancelBtn.onclick = () => { closeQrModal(); resolve(false); };
        
        modal.style.display = 'flex';
    });
}

// Função para fechar modal de QR
function closeQrModal() {
    document.getElementById('qrModal').style.display = 'none';
}

// Função para fechar modal de mapa
function closeMapModal() {
    document.getElementById('mapModal').style.display = 'none';
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }
}

// Função para mostrar detalhes da expedição
async function showDetalhesExpedicao(expeditionId) {
    const modal = document.getElementById('detalhesExpedicaoModal');
    const content = document.getElementById('detalhesContent');
    
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando detalhes...</div>';
    modal.style.display = 'flex';
    
    try {
        const expedition = await supabaseRequest(`expeditions?id=eq.${expeditionId}`, 'GET', null, false);
        const items = await supabaseRequest(`expedition_items?expedition_id=eq.${expeditionId}`, 'GET', null, false);
        
        if (!expedition || expedition.length === 0) {
            content.innerHTML = '<div class="alert alert-error">Expedição não encontrada.</div>';
            return;
        }
        
        const exp = expedition[0];
        const veiculo = veiculos.find(v => v.id === exp.veiculo_id);
        const motorista = motoristas.find(m => m.id === exp.motorista_id);
        const lider = lideres.find(l => l.id === exp.lider_id);
        
        let planilhaHTML = '';
        
        if (items && items.length > 0) {
            items.forEach((item, index) => {
                const loja = lojas.find(l => l.id === item.loja_id);
                
                if (index > 0) {
                    planilhaHTML += '<div style="page-break-before: always;"></div>';
                }
                
                planilhaHTML += `
                    <div class="planilha-controle">
                        <div class="planilha-header" style="background: #4a90e2; color: white; font-size: 16px; padding: 10px;">
                            LOJA ${loja?.codigo || 'N/A'} - ${loja?.nome || 'N/A'}
                        </div>
                        <!-- Resto do HTML da planilha... -->
                    </div>
                `;
            });
        } else {
            planilhaHTML = `
                <div class="planilha-controle">
                    <div class="planilha-header">DETALHES DA EXPEDIÇÃO</div>
                    <div class="alert alert-info">Nenhuma loja encontrada para esta expedição.</div>
                </div>
            `;
        }
        
        content.innerHTML = planilhaHTML;
        
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        content.innerHTML = '<div class="alert alert-error">Erro ao carregar detalhes da expedição.</div>';
    }
}

function closeDetalhesModal() {
    document.getElementById('detalhesExpedicaoModal').style.display = 'none';
}

function imprimirDetalhes() {
    window.print();
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    await loadFiliais();
});
