const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./database');
const whatsappManager = require('./whatsappClient');
const { processarMensagem } = require('./botEngine');
const updater = require('./updater');

const APP_DIR = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

const PORT = process.env.PORT || 3000;

// Resolução segura da pasta public (na pasta do executável ou no projeto)
const publicDir = fs.existsSync(path.join(APP_DIR, 'public'))
    ? path.join(APP_DIR, 'public')
    : path.join(__dirname, '..', 'public');

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir, {
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
}));

// Conecta o emissor de eventos do WhatsApp ao Socket.io
whatsappManager.setEventEmitter((event, data) => {
    io.emit(event, data);
});

// -----------------------------
// Rotas da API REST
// -----------------------------

// 1. Status do Bot e WhatsApp (sem cache)
app.get('/api/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const status = whatsappManager.getStatus();
    const stats = db.getEstatisticas();
    res.json({
        ...status,
        stats
    });
});

// 1.1 Endpoint de Imagem Direta do QR Code (PNG)
app.get('/api/qr.png', async (req, res) => {
    const status = whatsappManager.getStatus();
    if (!status.qr) {
        return res.status(404).send('QR Code ainda não disponível.');
    }

    try {
        const QRCode = require('qrcode');
        const buffer = await QRCode.toBuffer(status.qr, {
            width: 320,
            margin: 2,
            color: {
                dark: '#0F172A',
                light: '#FFFFFF'
            }
        });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(buffer);
    } catch (err) {
        res.status(500).send('Erro ao renderizar imagem do QR Code.');
    }
});

// 1.2 Endpoint Simples de QR Code
app.get('/api/bot/qr', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const status = whatsappManager.getStatus();
    res.json({
        status: status.status,
        qr: status.qr,
        qrImage: status.qrImage
    });
});

// 2. Listagem de Agendamentos com filtros
app.get('/api/appointments', (req, res) => {
    const { data, status, busca } = req.query;
    const agendamentos = db.getTodosAgendamentos({ data, status, busca });
    res.json(agendamentos);
});

// 3. Criar Agendamento Manual (pelo Dashboard)
app.post('/api/appointments', (req, res) => {
    const { cliente, telefone, data, horario, servico, preco } = req.body;

    if (!data || !horario) {
        return res.status(400).json({ success: false, error: 'Data e horário são obrigatórios!' });
    }

    const resultado = db.criarAgendamento({
        cliente: cliente || 'Cliente Balcão',
        telefone: telefone ? (telefone.includes('@') ? telefone : `${telefone.replace(/\D/g, '')}@c.us`) : 'balcao@c.us',
        data,
        horario,
        servico: servico || 'Corte Tradicional',
        preco: Number(preco) || 35,
        origem: 'manual'
    });

    if (!resultado.success) {
        return res.status(409).json(resultado);
    }

    // Emite evento para todos os clientes conectados
    io.emit('novo_agendamento', resultado.agendamento);

    res.status(201).json(resultado);
});

// 4. Cancelar Agendamento
app.delete('/api/appointments/:id', (req, res) => {
    const { id } = req.params;
    const resultado = db.cancelarAgendamento(id);

    if (!resultado.success) {
        return res.status(404).json(resultado);
    }

    io.emit('agendamento_cancelado', resultado.agendamento);
    res.json(resultado);
});

// 5. Concluir Agendamento
app.put('/api/appointments/:id/concluir', (req, res) => {
    const { id } = req.params;
    const resultado = db.concluirAgendamento(id);

    if (!resultado.success) {
        return res.status(404).json(resultado);
    }

    io.emit('agendamento_atualizado', resultado.agendamento);
    res.json(resultado);
});

// 6. Consultar Horários Livres e Ocupados para um dia específico
app.get('/api/slots', (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ error: 'Parâmetro date é obrigatório (YYYY-MM-DD)' });
    }

    const config = db.getConfig();
    const todosHorarios = config.horariosBase || [];
    const agendamentosDoDia = db.getTodosAgendamentos({ data: date, status: 'confirmado' });
    const horariosLivres = db.getHorariosDisponiveis(date);
    const hojeStr = db.formatarDataLocal(new Date());
    const isHojeFechado = (date === hojeStr) && db.isFechadoHoje();

    const slots = todosHorarios.map(h => {
        const ag = agendamentosDoDia.find(a => a.horario === h);
        return {
            horario: h,
            ocupado: !!ag,
            disponivel: !isHojeFechado && horariosLivres.includes(h),
            agendamento: ag || null
        };
    });

    res.json({
        data: date,
        fechadoHoje: isHojeFechado,
        motivoFechado: isHojeFechado ? (config.motivoFechado || 'Salão Fechado Hoje') : null,
        totalSlots: todosHorarios.length,
        livres: isHojeFechado ? 0 : horariosLivres.length,
        ocupados: agendamentosDoDia.length,
        slots
    });
});

// 7. Próximos dias disponíveis
app.get('/api/days', (req, res) => {
    const dias = db.getProximosDiasDisponiveis();
    res.json(dias);
});

// 8. Métricas e Estatísticas
app.get('/api/stats', (req, res) => {
    const stats = db.getEstatisticas();
    res.json(stats);
});

// 9. Configurações da Barbearia
app.get('/api/config', (req, res) => {
    const config = db.getConfig();
    res.json(config);
});

app.post('/api/config', (req, res) => {
    const novaConfig = req.body;
    const salva = db.salvarConfig(novaConfig);
    io.emit('config_atualizada', salva);
    io.emit('stats_update', db.getEstatisticas());
    res.json({ success: true, config: salva });
});

// 9.1 Alternar Modo "HOJE ESTAMOS FECHADOS"
app.post('/api/config/fechado-hoje', (req, res) => {
    const { fechado, motivo } = req.body;
    const configAtual = db.getConfig();
    const hojeStr = db.formatarDataLocal(new Date());

    const novaConfig = db.salvarConfig({
        ...configAtual,
        fechadoHoje: Boolean(fechado),
        motivoFechado: motivo !== undefined ? motivo : configAtual.motivoFechado,
        dataFechadaManual: fechado ? hojeStr : null
    });

    io.emit('config_atualizada', novaConfig);
    io.emit('stats_update', db.getEstatisticas());

    res.json({
        success: true,
        fechadoHoje: novaConfig.fechadoHoje,
        motivoFechado: novaConfig.motivoFechado,
        config: novaConfig
    });
});

// 10. Ações do Bot WhatsApp
app.post('/api/bot/restart', async (req, res) => {
    try {
        await whatsappManager.restart();
        res.json({ success: true, message: 'Reiniciando WhatsApp Web...' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/bot/logout', async (req, res) => {
    const resultado = await whatsappManager.logout();
    res.json(resultado);
});

// 11. Simulador de Conversa em Tempo Real (Testes Direto no Navegador)
app.post('/api/simulator/chat', async (req, res) => {
    const { telefone = '5511999998888@c.us', nome = 'Cliente Teste', mensagem } = req.body;

    if (!mensagem) {
        return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    const respostas = [];

    await processarMensagem({
        from: telefone,
        nome,
        texto: mensagem,
        sendMessage: async (to, texto) => {
            respostas.push({ to, texto, hora: new Date().toLocaleTimeString('pt-BR') });
        },
        sendTyping: async () => {},
        emitEvent: (event, data) => io.emit(event, data)
    });

    res.json({
        success: true,
        respostas,
        estadoAtual: db.getEstadoConversa(telefone)
    });
});

// 12. Auto-Update de Layout via GitHub
app.get('/api/system/version', (req, res) => {
    res.json(updater.obterVersaoLocal());
});

app.post('/api/system/update', async (req, res) => {
    const { force = false } = req.body;
    const resultado = await updater.verificarEAtualizarLayout(force);
    res.json(resultado);
});

// Rota coringa para o frontend SPA
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
});

// -----------------------------
// Conexão WebSocket (Socket.io)
// -----------------------------
io.on('connection', (socket) => {
    console.log(`🔌 Novo cliente conectado ao Dashboard (Socket ID: ${socket.id})`);

    // Envia o status atualizado imediatamente ao conectar
    socket.emit('status_change', whatsappManager.getStatus());
    socket.emit('stats_update', db.getEstatisticas());

    socket.on('disconnect', () => {
        // Desconexão do cliente do painel
    });
});

// -----------------------------
// Inicialização do Servidor
// -----------------------------
function startServer() {
    // Inicializa conexão e sincronização com o banco Supabase
    db.inicializarDatabase();

    // Verifica de forma não-bloqueante atualizações de layout no GitHub
    updater.verificarEAtualizarLayout(false).catch(() => {});

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌ ERRO: A porta ${PORT} já está sendo usada por outro processo!`);
            console.error(`Feche qualquer outra janela do BarbeariaBot aberta ou encerre processos anteriores.\n`);
        } else {
            console.error(`❌ Erro no servidor web:`, err.message);
        }
    });

    server.listen(PORT, () => {
        console.log(`\n======================================================`);
        console.log(`🚀 [PAINEL DO SALÃO ONLINE] Acesse http://localhost:${PORT}`);
        console.log(`💈 Barbearia Bot & Dashboard de Agendamentos Ativo`);
        console.log(`======================================================\n`);
        
        // Inicializa o cliente WhatsApp automaticamente
        whatsappManager.initialize();
    });
}

module.exports = {
    app,
    server,
    startServer
};
