const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// =====================================================================
// Diretório base da aplicação (compatível com pkg .exe e modo dev)
// =====================================================================
const APP_DIR = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');

// Configuração de Conexão Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mctppbkmyofeqfcursuz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_TBa-V_DmktUzSWkyc-Xl4A_ebaWcpee';

// ID padrão da Barbearia para este executável (pode ser sobrescrito em config_salao.json)
let BARBEARIA_ID = 'barbearia_principal';

const CONFIG_SALAO_PATH = path.join(APP_DIR, 'config_salao.json');
const DB_PATH = path.join(APP_DIR, 'agendamentos.json');

try {
    if (fs.existsSync(CONFIG_SALAO_PATH)) {
        const extraConfig = JSON.parse(fs.readFileSync(CONFIG_SALAO_PATH, 'utf8'));
        if (extraConfig && extraConfig.barbeariaId) {
            BARBEARIA_ID = extraConfig.barbeariaId;
        }
    }
} catch (e) {}

const DEFAULT_CONFIG = {
    nomeSalao: "Barbearia do Mika",
    numeroDono: "5515974062762@c.us",
    chavePix: "15974062762",
    endereco: "Rua Principal, 123 - Centro",
    fechadoHoje: false, // Modo "HOJE ESTAMOS FECHADOS"
    motivoFechado: "Folga da equipe",
    dataFechadaManual: null,
    diasSemana: {
        1: "Segunda",
        2: "Terça",
        3: "Quarta",
        4: "Quinta",
        5: "Sexta",
        6: "Sábado"
    },
    horariosBase: [
        "09:00", "10:00", "11:00",
        "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00",
        "20:00", "21:00"
    ],
    servicos: [
        { id: 1, nome: "Corte Tradicional / Social", preco: 35, duracao: "40 min", icone: "✂️" },
        { id: 2, nome: "Degradê / Fade / Navalhado", preco: 40, duracao: "45 min", icone: "💈" },
        { id: 3, nome: "Barba Terapia Completa", preco: 30, duracao: "35 min", icone: "🧔" },
        { id: 4, nome: "Combo Cabelo + Barba", preco: 60, duracao: "60 min", icone: "👑" },
        { id: 5, nome: "Sobrancelha / Acabamento", preco: 15, duracao: "15 min", icone: "✨" }
    ]
};

// Instância do Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

// Cache em memória para resposta instantânea
let cacheLocal = {
    config: DEFAULT_CONFIG,
    agendamentos: [],
    conversa: {}
};

// Carrega os dados do arquivo local
function carregarDados() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const raw = fs.readFileSync(DB_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            cacheLocal = {
                config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
                agendamentos: Array.isArray(parsed.agendamentos) ? parsed.agendamentos : [],
                conversa: parsed.conversa || {}
            };
            return cacheLocal;
        }
    } catch (err) {
        console.error("⚠️ Erro ao ler agendamentos.json:", err.message);
    }

    cacheLocal = {
        config: DEFAULT_CONFIG,
        agendamentos: [],
        conversa: {}
    };
    salvarDados(cacheLocal);
    return cacheLocal;
}

// Salva dados no arquivo JSON local como backup de segurança
function salvarDados(data) {
    try {
        cacheLocal = data;
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error("❌ Erro ao salvar dados no JSON local:", err.message);
        return false;
    }
}

// Inicializa o cache carregando do disco
carregarDados();

// =====================================================================
// Sincronização em Tempo Real com o Supabase
// =====================================================================
async function sincronizarComSupabase() {
    try {
        // 1. Busca Barbearia / Configurações
        const { data: barbData, error: barbErr } = await supabase
            .from('barbearias')
            .select('*')
            .eq('id', BARBEARIA_ID)
            .single();

        if (barbData && !barbErr) {
            cacheLocal.config.nomeSalao = barbData.nome || cacheLocal.config.nomeSalao;
            cacheLocal.config.numeroDono = barbData.telefone_dono || cacheLocal.config.numeroDono;
            cacheLocal.config.chavePix = barbData.chave_pix || cacheLocal.config.chavePix;
            cacheLocal.config.endereco = barbData.endereco || cacheLocal.config.endereco;
            cacheLocal.config.fechadoHoje = barbData.fechado_hoje !== undefined ? barbData.fechado_hoje : cacheLocal.config.fechadoHoje;
            cacheLocal.config.motivoFechado = barbData.motivo_fechado || cacheLocal.config.motivoFechado;
            cacheLocal.config.dataFechadaManual = barbData.data_fechada_manual || null;
            if (barbData.dias_semana) cacheLocal.config.diasSemana = barbData.dias_semana;
            if (barbData.horarios_base) cacheLocal.config.horariosBase = barbData.horarios_base;
        } else if (!barbData) {
            // Se a barbearia for nova, cadastra automaticamente no Supabase
            console.log(`✨ Criando cadastro automático para o ID "${BARBEARIA_ID}" no Supabase...`);
            await supabase.from('barbearias').upsert({
                id: BARBEARIA_ID,
                nome: cacheLocal.config.nomeSalao,
                telefone_dono: cacheLocal.config.numeroDono,
                chave_pix: cacheLocal.config.chavePix,
                endereco: cacheLocal.config.endereco,
                fechado_hoje: false,
                motivo_fechado: cacheLocal.config.motivoFechado,
                dias_semana: cacheLocal.config.diasSemana,
                horarios_base: cacheLocal.config.horariosBase
            });

            if (Array.isArray(cacheLocal.config.servicos)) {
                for (const s of cacheLocal.config.servicos) {
                    await supabase.from('servicos').insert({
                        barbearia_id: BARBEARIA_ID,
                        nome: s.nome,
                        preco: Number(s.preco),
                        duracao: s.duracao,
                        icone: s.icone || '✂️'
                    });
                }
            }
        }

        // 2. Busca Serviços
        const { data: servData, error: servErr } = await supabase
            .from('servicos')
            .select('*')
            .eq('barbearia_id', BARBEARIA_ID)
            .order('ordem', { ascending: true });

        if (servData && servData.length > 0 && !servErr) {
            cacheLocal.config.servicos = servData.map(s => ({
                id: s.id,
                nome: s.nome,
                preco: Number(s.preco),
                duracao: s.duracao,
                icone: s.icone || '✂️'
            }));
        }

        // 3. Busca Agendamentos
        const { data: agData, error: agErr } = await supabase
            .from('agendamentos')
            .select('*')
            .eq('barbearia_id', BARBEARIA_ID);

        if (agData && !agErr) {
            cacheLocal.agendamentos = agData.map(a => ({
                id: a.id,
                cliente: a.cliente,
                telefone: a.telefone,
                data: a.data,
                horario: a.horario,
                servico: a.servico,
                preco: Number(a.preco),
                status: a.status,
                origem: a.origem || 'whatsapp',
                criadoEm: a.criado_em,
                canceladoEm: a.cancelado_em,
                concluidoEm: a.concluido_em
            }));
        }

        // Salva backup atualizado em disco
        salvarDados(cacheLocal);
        return true;
    } catch (err) {
        // Se a tabela ainda não existir no Supabase, continua rodando com dados locais
        return false;
    }
}

// Inicializa sincronização e agenda repetição a cada 15 segundos
async function inicializarDatabase() {
    console.log(`🔌 Conectando ao Banco Supabase (Barbearia ID: ${BARBEARIA_ID})...`);
    const ok = await sincronizarComSupabase();
    if (ok) {
        console.log(`✅ [SUPABASE NUVEM] Dados sincronizados com sucesso!`);
    } else {
        console.log(`ℹ️ [OFFLINE / LOCAL] Operando com cache local.`);
    }

    setInterval(() => {
        sincronizarComSupabase().catch(() => {});
    }, 15000);
}

// Verifica se um horário específico em uma data está ocupado
function isHorarioOcupado(dataStr, horarioStr) {
    const dados = cacheLocal;
    return dados.agendamentos.some(ag => 
        ag.data === dataStr && 
        ag.horario === horarioStr && 
        ag.status === 'confirmado'
    );
}

// Retorna data formatada no fuso local (YYYY-MM-DD)
function formatarDataLocal(d = new Date()) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// Verifica se o salão está com o modo "HOJE ESTAMOS FECHADOS" ativado
function isFechadoHoje(dados = null) {
    if (!dados) dados = cacheLocal;
    const config = dados.config || {};
    const hojeStr = formatarDataLocal(new Date());

    if (config.fechadoHoje === true) {
        if (!config.dataFechadaManual || config.dataFechadaManual === hojeStr) {
            return true;
        }
    }
    return false;
}

// Retorna lista de horários verdadeiramente livres para uma data
function getHorariosDisponiveis(dataStr) {
    const dados = cacheLocal;
    const hoje = new Date();
    const hojeStr = formatarDataLocal(hoje);

    // Se hoje estiver marcado como fechado e a data consultada for hoje
    if (dataStr === hojeStr && isFechadoHoje(dados)) {
        return [];
    }

    const agendados = dados.agendamentos
        .filter(ag => ag.data === dataStr && ag.status === 'confirmado')
        .map(ag => ag.horario);

    let horarios = [...(dados.config.horariosBase || [])];

    // Se a data for hoje, não mostrar horários que já passaram
    if (dataStr === hojeStr) {
        const horaAtualMinutos = hoje.getHours() * 60 + hoje.getMinutes();
        horarios = horarios.filter(h => {
            const [hora, min] = h.split(':').map(Number);
            return (hora * 60 + min) > horaAtualMinutos;
        });
    }

    return horarios.filter(h => !agendados.includes(h));
}

// Pega os próximos dias disponíveis de acordo com os dias de funcionamento
function getProximosDiasDisponiveis() {
    const dados = cacheLocal;
    const hoje = new Date();
    const hojeStr = formatarDataLocal(hoje);
    const dias = [];
    
    for (let i = 0; i < 14 && dias.length < 6; i++) {
        const d = new Date(hoje);
        d.setDate(hoje.getDate() + i);
        const dataStr = formatarDataLocal(d);
        const diaSemanaNum = d.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
        
        if (dataStr === hojeStr && isFechadoHoje(dados)) {
            continue;
        }

        if (dados.config.diasSemana && dados.config.diasSemana[diaSemanaNum]) {
            const horariosLivres = getHorariosDisponiveis(dataStr);
            
            if (horariosLivres.length > 0) {
                const nomeDia = dados.config.diasSemana[diaSemanaNum];
                const diaFormatado = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                
                dias.push({
                    diaSemanaNum,
                    nomeDia,
                    dataStr,
                    rotulo: `${nomeDia} (${diaFormatado})`,
                    vagasDisponiveis: horariosLivres.length
                });
            }
        }
    }
    return dias;
}

// Criação de agendamento ATÔMICA com validação anti-conflito e gravação em nuvem
function criarAgendamento({ cliente, telefone, data, horario, servico, preco, origem = 'whatsapp' }) {
    const dados = cacheLocal;
    const hojeStr = formatarDataLocal(new Date());

    if (data === hojeStr && isFechadoHoje(dados)) {
        return {
            success: false,
            error: `O salão está fechado hoje (${dados.config.motivoFechado || 'Atendimento pausado'}). Escolha outro dia disponível!`,
            codigo: 'SALAO_FECHADO_HOJE'
        };
    }

    // 🛡️ VERIFICAÇÃO ANTI-COLISÃO
    const jaOcupado = dados.agendamentos.some(ag => 
        ag.data === data && 
        ag.horario === horario && 
        ag.status === 'confirmado'
    );

    if (jaOcupado) {
        return {
            success: false,
            error: `O horário ${horario} no dia ${data} já foi reservado por outro cliente!`,
            codigo: 'HORARIO_OCUPADO'
        };
    }

    const idGerado = 'ag_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const novoAgendamento = {
        id: idGerado,
        cliente: cliente || 'Cliente WhatsApp',
        telefone: telefone,
        data: data,
        horario: horario,
        servico: servico || 'Corte de Cabelo',
        preco: Number(preco) || 35,
        status: 'confirmado',
        origem: origem,
        criadoEm: new Date().toISOString()
    };

    dados.agendamentos.push(novoAgendamento);
    
    if (dados.conversa && dados.conversa[telefone]) {
        delete dados.conversa[telefone];
    }

    salvarDados(dados);

    // Persiste no Supabase em segundo plano
    (async () => {
        try {
            await supabase.from('agendamentos').insert({
                id: novoAgendamento.id,
                barbearia_id: BARBEARIA_ID,
                cliente: novoAgendamento.cliente,
                telefone: novoAgendamento.telefone,
                data: novoAgendamento.data,
                horario: novoAgendamento.horario,
                servico: novoAgendamento.servico,
                preco: novoAgendamento.preco,
                status: novoAgendamento.status,
                origem: novoAgendamento.origem,
                criado_em: novoAgendamento.criadoEm
            });
        } catch (err) {
            console.error("⚠️ Erro ao persistir agendamento no Supabase:", err.message);
        }
    })();

    return {
        success: true,
        agendamento: novoAgendamento
    };
}

// Cancela agendamento pelo ID
function cancelarAgendamento(id, telefoneSolicitante = null) {
    const dados = cacheLocal;
    const index = dados.agendamentos.findIndex(ag => 
        ag.id === id && 
        ag.status === 'confirmado' &&
        (!telefoneSolicitante || ag.telefone === telefoneSolicitante)
    );

    if (index === -1) {
        return { success: false, error: 'Agendamento não encontrado ou já cancelado.' };
    }

    const agora = new Date().toISOString();
    dados.agendamentos[index].status = 'cancelado';
    dados.agendamentos[index].canceladoEm = agora;
    
    salvarDados(dados);

    // Persiste no Supabase
    (async () => {
        try {
            await supabase
                .from('agendamentos')
                .update({ status: 'cancelado', cancelado_em: agora })
                .eq('id', id)
                .eq('barbearia_id', BARBEARIA_ID);
        } catch (err) {
            console.error("⚠️ Erro ao cancelar agendamento no Supabase:", err.message);
        }
    })();

    return {
        success: true,
        agendamento: dados.agendamentos[index]
    };
}

// Conclui atendimento
function concluirAgendamento(id) {
    const dados = cacheLocal;
    const ag = dados.agendamentos.find(a => a.id === id);
    if (!ag) return { success: false, error: 'Agendamento não encontrado.' };

    const agora = new Date().toISOString();
    ag.status = 'concluido';
    ag.concluidoEm = agora;
    salvarDados(dados);

    // Persiste no Supabase
    (async () => {
        try {
            await supabase
                .from('agendamentos')
                .update({ status: 'concluido', concluido_em: agora })
                .eq('id', id)
                .eq('barbearia_id', BARBEARIA_ID);
        } catch (err) {
            console.error("⚠️ Erro ao concluir agendamento no Supabase:", err.message);
        }
    })();

    return { success: true, agendamento: ag };
}

// Busca agendamentos ativos do cliente
function getAgendamentosCliente(telefone) {
    const dados = cacheLocal;
    return dados.agendamentos.filter(ag => 
        ag.telefone === telefone && 
        ag.status === 'confirmado'
    );
}

// Busca todos os agendamentos com filtros
function getTodosAgendamentos(filtro = {}) {
    const dados = cacheLocal;
    let lista = [...dados.agendamentos];

    if (filtro.data) {
        lista = lista.filter(a => a.data === filtro.data);
    }
    if (filtro.status) {
        lista = lista.filter(a => a.status === filtro.status);
    }
    if (filtro.busca) {
        const b = filtro.busca.toLowerCase();
        lista = lista.filter(a => 
            (a.cliente && a.cliente.toLowerCase().includes(b)) ||
            (a.telefone && a.telefone.includes(b)) ||
            (a.servico && a.servico.toLowerCase().includes(b))
        );
    }

    return lista.sort((a, b) => (a.data + ' ' + a.horario).localeCompare(b.data + ' ' + b.horario));
}

// Métricas para o Dashboard
function getEstatisticas() {
    const dados = cacheLocal;
    const hoje = formatarDataLocal(new Date());

    const hojeAgendamentos = dados.agendamentos.filter(a => a.data === hoje && a.status === 'confirmado');
    const totalConfirmados = dados.agendamentos.filter(a => a.status === 'confirmado');
    const totalConcluidos = dados.agendamentos.filter(a => a.status === 'concluido');
    const faturamentoTotal = [...totalConfirmados, ...totalConcluidos].reduce((acc, curr) => acc + (curr.preco || 0), 0);
    const horariosLivresHoje = getHorariosDisponiveis(hoje).length;

    return {
        agendamentosHoje: hojeAgendamentos.length,
        totalConfirmados: totalConfirmados.length,
        totalConcluidos: totalConcluidos.length,
        faturamentoEstimado: faturamentoTotal,
        horariosLivresHoje: horariosLivresHoje,
        totalServicos: (dados.config.servicos || []).length
    };
}

// Gerenciamento de Estado de Conversa
function getEstadoConversa(telefone) {
    const dados = cacheLocal;
    return (dados.conversa && dados.conversa[telefone]) || { status: 'idle' };
}

function setEstadoConversa(telefone, estado) {
    const dados = cacheLocal;
    if (!dados.conversa) dados.conversa = {};
    dados.conversa[telefone] = {
        ...estado,
        atualizadoEm: Date.now()
    };
    salvarDados(dados);

    // Persiste no Supabase
    (async () => {
        try {
            await supabase.from('conversas').upsert({
                barbearia_id: BARBEARIA_ID,
                telefone: telefone,
                estado: dados.conversa[telefone],
                atualizado_em: new Date().toISOString()
            });
        } catch (e) {}
    })();
}

function limparEstadoConversa(telefone) {
    const dados = cacheLocal;
    if (dados.conversa && dados.conversa[telefone]) {
        delete dados.conversa[telefone];
        salvarDados(dados);
    }

    // Remove do Supabase
    (async () => {
        try {
            await supabase
                .from('conversas')
                .delete()
                .eq('barbearia_id', BARBEARIA_ID)
                .eq('telefone', telefone);
        } catch (e) {}
    })();
}

// Configurações
function getConfig() {
    const dados = cacheLocal;
    return dados.config;
}

function salvarConfig(novaConfig) {
    const dados = cacheLocal;
    dados.config = { ...dados.config, ...novaConfig };
    salvarDados(dados);

    // Persiste no Supabase
    (async () => {
        try {
            const { error: barbErr } = await supabase.from('barbearias').upsert({
                id: BARBEARIA_ID,
                nome: dados.config.nomeSalao,
                telefone_dono: dados.config.numeroDono,
                chave_pix: dados.config.chavePix,
                endereco: dados.config.endereco,
                fechado_hoje: Boolean(dados.config.fechadoHoje),
                motivo_fechado: dados.config.motivoFechado,
                data_fechada_manual: dados.config.dataFechadaManual,
                dias_semana: dados.config.diasSemana,
                horarios_base: dados.config.horariosBase,
                updated_at: new Date().toISOString()
            });

            if (barbErr) {
                console.error("⚠️ Erro ao sincronizar barbearia no Supabase:", barbErr.message);
            }

            // Se vier lista de serviços atualizada
            if (Array.isArray(novaConfig.servicos)) {
                for (const s of novaConfig.servicos) {
                    const { error: servErr } = await supabase.from('servicos').upsert({
                        id: s.id,
                        barbearia_id: BARBEARIA_ID,
                        nome: s.nome,
                        preco: Number(s.preco),
                        duracao: s.duracao,
                        icone: s.icone || '✂️'
                    });
                    if (servErr) {
                        console.error("⚠️ Erro ao sincronizar serviço no Supabase:", servErr.message);
                    }
                }
            }
        } catch (err) {
            console.error("⚠️ Erro ao salvar configurações no Supabase:", err.message);
        }
    })();

    return dados.config;
}

module.exports = {
    inicializarDatabase,
    sincronizarComSupabase,
    carregarDados,
    salvarDados,
    isHorarioOcupado,
    formatarDataLocal,
    isFechadoHoje,
    getHorariosDisponiveis,
    getProximosDiasDisponiveis,
    criarAgendamento,
    cancelarAgendamento,
    concluirAgendamento,
    getAgendamentosCliente,
    getTodosAgendamentos,
    getEstatisticas,
    getEstadoConversa,
    setEstadoConversa,
    limparEstadoConversa,
    getConfig,
    salvarConfig
};
