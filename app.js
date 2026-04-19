// --- CONFIGURAÇÃO DE TEMPO ---
let DATA_INICIO_GRAFICO = new Date(new Date().getFullYear(), 0, 1);
let DATA_FIM_GRAFICO = new Date(new Date().getFullYear(), 11, 31);
let totalDiasAno = 365;
let LARGURA_DIA_PX = 25;

// --- DADOS (LOCALSTORAGE) ---
let etapas = [];
let termoBusca = '';

const ETAPAS_EXEMPLO = [
    { id: 1, status: 'P', nome: 'Planejamento Inicial', inicio: '2026-03-01', fim: '2026-03-15', responsavel: '', dependencia: '', modoInicio: 'manual', prioridade: 'M' },
    { id: 2, status: 'C', nome: 'Levantamento de requisitos', inicio: '2026-03-01', fim: '2026-03-05', responsavel: 'Maria', dependencia: '', modoInicio: 'manual', prioridade: 'A' },
    { id: 3, status: 'A', nome: 'Desenvolvimento Backend', inicio: '2026-03-06', fim: '2026-03-12', responsavel: 'João', dependencia: '2', modoInicio: 'link', prioridade: 'M' }
];

function salvarDados() { localStorage.setItem('gantt_etapas_data', JSON.stringify(etapas)); }
function carregarDados() {
    const salvos = localStorage.getItem('gantt_etapas_data');
    etapas = salvos ? JSON.parse(salvos) : [...ETAPAS_EXEMPLO];
    etapas.forEach(e => { if (!e.prioridade) e.prioridade = 'M'; });
}

function limparTudo() {
    mostrarConfirmacao("Deseja apagar todos os dados permanentemente?", () => {
        localStorage.removeItem('gantt_etapas_data');
        location.reload();
    });
}

// --- TOASTS ---
function mostrarToast(msg, tipo = 'sucesso') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('saindo');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- MODAL DE CONFIRMAÇÃO ---
function mostrarConfirmacao(msg, callback) {
    document.getElementById('modalConfirmacaoMensagem').textContent = msg;
    document.getElementById('modalConfirmacaoOverlay').style.display = 'flex';
    document.getElementById('btnConfirmarAcao').onclick = () => {
        fecharModalConfirmacao();
        callback();
    };
}
function fecharModalConfirmacao() {
    document.getElementById('modalConfirmacaoOverlay').style.display = 'none';
}

// --- LÓGICA DE NEGÓCIO ---
function calcularDatasProjetos() {
    let projetoAtual = null, range = { min: null, max: null };
    etapas.forEach(e => {
        if (e.status === 'P') {
            if (projetoAtual) {
                projetoAtual.inicio = range.min ? formataData(range.min) : projetoAtual.inicio;
                projetoAtual.fim = range.max ? formataData(range.max) : projetoAtual.fim;
            }
            projetoAtual = e; range = { min: null, max: null };
        } else if (projetoAtual && e.inicio && e.fim) {
            let dI = new Date(e.inicio + 'T12:00:00'), dF = new Date(e.fim + 'T12:00:00');
            if (!range.min || dI < range.min) range.min = dI;
            if (!range.max || dF > range.max) range.max = dF;
        }
    });
    if (projetoAtual) {
        projetoAtual.inicio = range.min ? formataData(range.min) : projetoAtual.inicio;
        projetoAtual.fim = range.max ? formataData(range.max) : projetoAtual.fim;
    }
}

function recalcularDependencias() {
    for (let i = 0; i < 5; i++) {
        etapas.forEach(e => {
            if (e.modoInicio === 'link' && e.dependencia) {
                const pai = etapas.find(p => p.id == e.dependencia);
                if (pai && pai.fim) {
                    let dPai = new Date(pai.fim + 'T12:00:00');
                    dPai.setDate(dPai.getDate() + 1);
                    let novoIni = formataData(dPai);
                    if (e.inicio !== novoIni) {
                        let dur = (e.inicio && e.fim) ? Math.round((new Date(e.fim + 'T12:00:00') - new Date(e.inicio + 'T12:00:00')) / (1000 * 3600 * 24)) : 0;
                        e.inicio = novoIni;
                        if (dur > 0) {
                            let dFim = new Date(novoIni + 'T12:00:00'); dFim.setDate(dFim.getDate() + dur);
                            e.fim = formataData(dFim);
                        }
                    }
                }
            }
        });
    }
}

function detectarCiclo(filhoId, paiId) {
    let atual = paiId;
    const visitados = new Set();
    while (atual) {
        if (String(atual) === String(filhoId)) return true;
        if (visitados.has(atual)) break;
        visitados.add(atual);
        const tarefa = etapas.find(x => String(x.id) === String(atual));
        atual = tarefa ? tarefa.dependencia : null;
    }
    return false;
}

// --- EXPORTAÇÃO E IMPORTAÇÃO ---
function baixarModeloGabarito() {
    const worksheet = XLSX.utils.json_to_sheet(etapas);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cronograma");
    XLSX.writeFile(workbook, "Cronograma_Gestao.xlsx");
}

function importarDeExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const jsonDados = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonDados.length > 0) {
                etapas = jsonDados;
                etapas.forEach(t => { if (!t.prioridade) t.prioridade = 'M'; });
                recalcularDependencias(); calcularDatasProjetos(); desenharEtapas();
                mostrarToast('Dados importados com sucesso!', 'sucesso');
            } else {
                mostrarToast('Planilha vazia ou sem dados reconhecidos.', 'aviso');
            }
        } catch (erro) {
            mostrarToast('Erro ao ler a planilha. Verifique o formato.', 'erro');
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// --- BUSCA ---
function buscarTarefas(valor) {
    termoBusca = valor;
    desenharEtapas();
}

// --- RENDERIZAÇÃO ---
function desenharEtapas() {
    const termo = termoBusca.toLowerCase();
    const etapasFiltradas = termo
        ? etapas.filter(e => e.status === 'P' ||
            (e.nome && e.nome.toLowerCase().includes(termo)) ||
            (e.responsavel && e.responsavel.toLowerCase().includes(termo)))
        : etapas;

    let htmlDados = `<div class="linha-dados cabecalho-tabela">
        <div class="col-acoes"></div>
        <div class="col-prioridade">PRIO.</div>
        <div class="col-status">STATUS</div>
        <div class="col-nome">ATIVIDADE</div>
        <div class="col-data-inicio">INÍCIO</div>
        <div class="col-data">FIM</div>
        <div class="col-duracao">DUR.</div>
        <div class="col-resp">RESPONSÁVEL</div>
    </div>`;
    let htmlCronograma = '';
    let row = 3;

    etapasFiltradas.forEach(e => {
        const isP = e.status === 'P';
        const prio = e.prioridade || 'M';
        let dur = (e.inicio && e.fim) ? Math.round((new Date(e.fim + 'T12:00:00') - new Date(e.inicio + 'T12:00:00')) / (1000 * 3600 * 24)) + 'd' : '-';

        htmlDados += `
            <div class="linha-dados ${isP ? 'projeto' : ''} bg-linha-${e.status}" onclick="if(document.body.classList.contains('selecionando-link')) vincularTarefa(${e.id})">
                <div class="col-acoes">
                    <button class="btn-add" title="Adicionar abaixo" onclick="adicionarEtapa(${e.id})">+</button>
                    <button class="btn-del" title="Excluir" onclick="removerEtapa(${e.id})">×</button>
                </div>
                <div class="col-prioridade">
                    <select class="select-prioridade prio-${prio}" onchange="atualizarPrioridade(${e.id}, this)">
                        <option value="A" ${prio === 'A' ? 'selected' : ''}>A</option>
                        <option value="M" ${prio === 'M' ? 'selected' : ''}>M</option>
                        <option value="B" ${prio === 'B' ? 'selected' : ''}>B</option>
                    </select>
                </div>
                <select class="col-status status-${e.status}" onchange="atualizarCampo(${e.id},'status',this.value)">
                    <option value="P" ${e.status === 'P' ? 'selected' : ''}>PROJETO</option>
                    <option value="A" ${e.status === 'A' ? 'selected' : ''}>ANDAMENTO</option>
                    <option value="N" ${e.status === 'N' ? 'selected' : ''}>NÃO INIC.</option>
                    <option value="C" ${e.status === 'C' ? 'selected' : ''}>CONCLUÍDO</option>
                    <option value="B" ${e.status === 'B' ? 'selected' : ''}>BLOQUEADO</option>
                </select>
                <div class="col-nome editavel" contenteditable="true" onblur="atualizarCampo(${e.id},'nome',this.innerText)">${sanitizar(e.nome)}</div>
                <div class="col-data-inicio">
                    <div class="input-data btn-abrir-modal" onclick="abrirModalInicio(${e.id})">
                        ${e.inicio ? e.inicio.split('-').reverse().join('/') : 'Definir'} ${e.dependencia ? '🔗' : ''}
                    </div>
                </div>
                <div class="col-data">
                    <input type="date" class="input-data ${isP ? 'projeto-data' : ''}" value="${e.fim || ''}" onchange="atualizarCampo(${e.id},'fim',this.value)">
                </div>
                <div class="col-duracao">${dur}</div>
                <div class="col-resp editavel" contenteditable="true" onblur="atualizarCampo(${e.id},'responsavel',this.innerText)">${sanitizar(e.responsavel)}</div>
            </div>`;

        if (e.inicio && e.fim) {
            let colI = Math.floor((new Date(e.inicio + 'T12:00:00') - DATA_INICIO_GRAFICO) / (1000 * 3600 * 24)) + 1;
            let colF = Math.floor((new Date(e.fim + 'T12:00:00') - DATA_INICIO_GRAFICO) / (1000 * 3600 * 24)) + 2;
            if (colF > colI) {
                htmlCronograma += `<div class="linha-cronograma ${isP ? 'projeto' : ''}" style="grid-row:${row};"><div class="barra-etapa status-${e.status}" style="grid-column:${colI}/${colF};" title="${sanitizar(e.nome)} (${dur})"></div></div>`;
            } else {
                htmlCronograma += `<div class="linha-cronograma" style="grid-row:${row};"></div>`;
            }
        } else {
            htmlCronograma += `<div class="linha-cronograma" style="grid-row:${row};"></div>`;
        }
        row++;
    });

    document.getElementById('areaDados').innerHTML = htmlDados;
    document.getElementById('barrasTempo').innerHTML = htmlCronograma;

    salvarDados();
}

// --- AUXILIARES ---
function sanitizar(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = String(texto).trim();
    return div.innerHTML;
}

function formataData(d) { return d.toISOString().split('T')[0]; }

function atualizarCampo(id, campo, valor) {
    let e = etapas.find(x => x.id === id);
    if (!e) return;
    if (campo === 'nome' || campo === 'responsavel') {
        valor = String(valor).trim();
    }
    e[campo] = valor;
    if (campo === 'status') {
        const sel = document.querySelector(`select.col-status[onchange*="${id}"]`);
        if (sel) { sel.className = `col-status status-${valor}`; }
    }
    if (campo === 'inicio' || campo === 'fim') { recalcularDependencias(); calcularDatasProjetos(); }
    desenharEtapas();
}

function atualizarPrioridade(id, selectEl) {
    const valor = selectEl.value;
    selectEl.className = `select-prioridade prio-${valor}`;
    let e = etapas.find(x => x.id === id);
    if (e) { e.prioridade = valor; salvarDados(); }
}

function adicionarEtapa(id) {
    etapas.splice(etapas.findIndex(x => x.id === id) + 1, 0, {
        id: Date.now(), status: 'N', nome: 'Nova Tarefa', inicio: '', fim: '',
        responsavel: '', modoInicio: 'manual', dependencia: '', prioridade: 'M'
    });
    desenharEtapas();
}

function removerEtapa(id) {
    mostrarConfirmacao("Tem certeza que deseja excluir esta tarefa?", () => {
        etapas = etapas.filter(x => x.id !== id);
        desenharEtapas();
    });
}

// --- MODAL LÓGICA ---
let modalId = null;
function abrirModalInicio(id) {
    modalId = id;
    let tarefa = etapas.find(x => x.id === id);
    document.getElementById('modalInputData').value = tarefa.inicio || '';
    document.getElementById('modalInicioOverlay').style.display = 'flex';
    alternarModoModal(tarefa.modoInicio || 'manual');
}
function fecharModalInicio() {
    document.getElementById('modalInicioOverlay').style.display = 'none';
    document.body.classList.remove('selecionando-link');
}
function alternarModoModal(m) {
    document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(m === 'manual' ? 'btnSwitchPencil' : 'btnSwitchLink').classList.add('active');
    document.getElementById('modalInputData').style.display = m === 'manual' ? 'block' : 'none';
    document.getElementById('modalInstrucaoLink').style.display = m === 'link' ? 'block' : 'none';
    if (m === 'link') document.body.classList.add('selecionando-link');
    else document.body.classList.remove('selecionando-link');
}
function salvarModal() {
    let e = etapas.find(x => x.id === modalId);
    e.modoInicio = 'manual'; e.inicio = document.getElementById('modalInputData').value; e.dependencia = '';
    fecharModalInicio(); recalcularDependencias(); calcularDatasProjetos(); desenharEtapas();
}
function vincularTarefa(paiId) {
    if (paiId === modalId) return;
    if (detectarCiclo(modalId, paiId)) {
        mostrarToast('Dependência circular detectada! Vínculo cancelado.', 'erro');
        fecharModalInicio();
        return;
    }
    let e = etapas.find(x => x.id === modalId);
    e.modoInicio = 'link'; e.dependencia = paiId;
    fecharModalInicio(); recalcularDependencias(); calcularDatasProjetos(); desenharEtapas();
}

// --- LÓGICA DE CALENDÁRIO & UX ---
function popularDropdownAnos() {
    const anoAtual = new Date().getFullYear();
    const anos = [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2, anoAtual + 3];
    ['filtroAnoIni', 'filtroAnoFim'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = anos.map(a =>
            `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`
        ).join('');
    });
}

function atualizarPeriodoGrafico() {
    const mi = parseInt(document.getElementById('filtroMesIni').value), ai = parseInt(document.getElementById('filtroAnoIni').value);
    const mf = parseInt(document.getElementById('filtroMesFim').value), af = parseInt(document.getElementById('filtroAnoFim').value);
    DATA_INICIO_GRAFICO = new Date(ai, mi - 1, 1); DATA_FIM_GRAFICO = new Date(af, mf, 0);
    totalDiasAno = Math.round((DATA_FIM_GRAFICO - DATA_INICIO_GRAFICO) / (1000 * 3600 * 24)) + 1;
    desenharCabecalho(); desenharEtapas();
}

function desenharCabecalho() {
    const cro = document.getElementById('areaCronograma');
    cro.style.gridTemplateColumns = `repeat(${totalDiasAno}, minmax(${LARGURA_DIA_PX}px, 1fr))`;
    let hM = '', hD = '', fds = '';

    let hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const nomesMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    let mesAtual = -1;
    let inicioMesCol = 1;

    for (let i = 0; i < totalDiasAno; i++) {
        let d = new Date(DATA_INICIO_GRAFICO.getTime() + i * 24 * 60 * 60 * 1000);
        let diaSemana = d.getDay();
        let isFimSemana = (diaSemana === 0 || diaSemana === 6);
        let isHoje = d.getTime() === hoje.getTime();

        hD += `<div class="celula-cabecalho ${isFimSemana ? 'dia-fim-semana' : ''}" style="grid-column:${i + 1};" title="${d.toLocaleDateString()}">${d.getDate()}</div>`;
        fds += `<div class="linha-grade-vertical ${isFimSemana ? 'fim-semana' : ''} ${isHoje ? 'marca-hoje' : ''}" style="grid-column:${i + 1};"></div>`;

        if (d.getMonth() !== mesAtual) {
            if (mesAtual !== -1) {
                hM += `<div class="celula-cabecalho" style="grid-column:${inicioMesCol}/${i + 1}; justify-content: flex-start; padding-left: 10px;">${nomesMeses[mesAtual]} ${new Date(DATA_INICIO_GRAFICO.getTime() + (inicioMesCol - 1) * 24 * 60 * 60 * 1000).getFullYear()}</div>`;
            }
            mesAtual = d.getMonth();
            inicioMesCol = i + 1;
        }
    }
    hM += `<div class="celula-cabecalho" style="grid-column:${inicioMesCol}/${totalDiasAno + 1}; justify-content: flex-start; padding-left: 10px;">${nomesMeses[mesAtual]} ${new Date(DATA_INICIO_GRAFICO.getTime() + (inicioMesCol - 1) * 24 * 60 * 60 * 1000).getFullYear()}</div>`;

    document.getElementById('cabecalhoTempo').innerHTML = `<div class="linha-cabecalho meses">${hM}</div><div class="linha-cabecalho dias">${hD}</div><div class="fundo-grade-excel" style="grid-row:3/999;">${fds}</div>`;
}

function irParaHoje() {
    let hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let diasDiferenca = Math.floor((hoje - DATA_INICIO_GRAFICO) / (1000 * 3600 * 24));
    if (diasDiferenca >= 0 && diasDiferenca <= totalDiasAno) {
        let posicaoScroll = (diasDiferenca * LARGURA_DIA_PX) - 100;
        document.getElementById('areaCronograma').scrollTo({ left: posicaoScroll, behavior: 'smooth' });
    } else {
        mostrarToast('O dia de hoje está fora do período exibido. Ajuste os filtros!', 'aviso');
    }
}

window.onload = () => {
    carregarDados();
    popularDropdownAnos();
    atualizarPeriodoGrafico();

    let opcoesData = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('textoDataAtual').innerText = new Date().toLocaleDateString('pt-BR', opcoesData);

    const aC = document.getElementById('areaCronograma');
    const aD = document.getElementById('areaDados');
    let isSyncingLeft = false; let isSyncingRight = false;

    aD.addEventListener('scroll', function() {
        if (!isSyncingLeft) { isSyncingRight = true; aC.scrollTop = this.scrollTop; }
        isSyncingLeft = false;
    });
    aC.addEventListener('scroll', function() {
        if (!isSyncingRight) { isSyncingLeft = true; aD.scrollTop = this.scrollTop; }
        isSyncingRight = false;
    });

    setTimeout(irParaHoje, 500);
};

function moverMes(v) { document.getElementById('areaCronograma').scrollBy({ left: v * 300, behavior: 'smooth' }); }
