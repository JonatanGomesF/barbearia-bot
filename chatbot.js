const path = require('path');
const fs = require('fs');
const { startServer } = require('./src/server');
const db = require('./src/database');
const whatsappManager = require('./src/whatsappClient');

const APP_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

function registrarErro(tipo, erro) {
    try {
        const msg = erro ? (erro.stack || erro.message || String(erro)) : 'Erro desconhecido';
        const logPath = path.join(APP_DIR, 'erro_log.txt');
        const linha = `[${new Date().toISOString()}] ${tipo}: ${msg}\n`;
        fs.appendFileSync(logPath, linha, 'utf8');
    } catch (e) {}
}

process.on('uncaughtException', function (err) {
    console.error('\n❌ [ERRO NÃO TRATADO]:', err);
    registrarErro('UNCAUGHT_EXCEPTION', err);
});

process.on('unhandledRejection', function (reason) {
    const msg = reason ? (reason.message || String(reason)) : '';
    // Ignora erros normais de ciclo de vida do Puppeteer ao desconectar/navegar
    if (msg.includes('Execution context was destroyed') || 
        msg.includes('EBUSY') || 
        msg.includes('Target closed') || 
        msg.includes('Session closed') ||
        msg.includes('Protocol error')) {
        return;
    }
    console.error('\n⚠️ [REJEIÇÃO NÃO TRATADA]:', reason);
    registrarErro('UNHANDLED_REJECTION', reason);
});

// Relatório semanal automático todo sábado às 20h
setInterval(async () => {
    const agora = new Date();
    // 6 = Sábado
    if (agora.getDay() === 6 && agora.getHours() === 20 && agora.getMinutes() === 0) {
        const stats = db.getEstatisticas();
        const config = db.getConfig();

        if (config.numeroDono && whatsappManager.status === 'READY') {
            try {
                await whatsappManager.sendMessage(
                    config.numeroDono,
                    `📊 *RELATÓRIO SEMANAL — ${config.nomeSalao.toUpperCase()}*\n\n` +
                    `✂️ *Total de Agendamentos Ativos:* ${stats.totalConfirmados}\n` +
                    `✅ *Atendimentos Concluídos:* ${stats.totalConcluidos}\n` +
                    `💰 *Faturamento Estimado:* R$ ${stats.faturamentoEstimado.toFixed(2)}\n\n` +
                    `_Tenha um excelente fim de semana!_ 💈`
                );
            } catch (err) {
                console.error("Erro ao enviar relatório semanal:", err.message);
            }
        }
    }
}, 60 * 1000);

// Inicia servidor web com dashboard e bot WhatsApp
startServer();

// Abre o painel no navegador automaticamente após subir o servidor
setTimeout(() => {
    try {
        const { exec } = require('child_process');
        if (process.platform === 'win32') {
            exec('start "" "http://localhost:3000"');
        }
    } catch (e) {}
}, 2000);