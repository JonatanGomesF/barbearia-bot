const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { processarMensagem } = require('./botEngine');

const APP_DIR = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');

// Helper para localizar o executável do Chrome/Edge/Brave em qualquer Windows
function findChromeExecutable() {
    try {
        const puppeteerPath = puppeteer.executablePath();
        if (puppeteerPath && fs.existsSync(puppeteerPath)) return puppeteerPath;
    } catch(e) {}

    const standardPaths = [
        // Google Chrome
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
        process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
        process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : null,

        // Microsoft Edge (Nativo no Windows 10 e 11!)
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,
        process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,
        process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,

        // Brave Browser
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') : null
    ];

    for (const p of standardPaths) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }
    return undefined;
}

class WhatsAppManager {
    constructor() {
        this.client = null;
        this.status = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, AUTHENTICATED, READY, ERROR
        this.currentQr = null;
        this.currentQrImage = null;
        this.userInfo = null;
        this.eventEmitter = null;
        this.startTime = Date.now();
        this.processedMessages = new Set();
        this.recentBotReplies = new Set();
    }

    setEventEmitter(emitter) {
        this.eventEmitter = emitter;
    }

    emit(event, data) {
        if (this.eventEmitter) {
            this.eventEmitter(event, data);
        }
    }

    getStatus() {
        return {
            status: this.status,
            qr: this.currentQr,
            qrImage: this.currentQrImage,
            userInfo: this.userInfo,
            uptime: Math.floor((Date.now() - this.startTime) / 1000)
        };
    }

    async initialize() {
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (e) {
                console.log("Aviso ao limpar cliente anterior:", e.message);
            }
            this.client = null;
        }

        this.status = 'INITIALIZING';
        this.currentQr = null;
        this.currentQrImage = null;
        this.emit('status_change', { status: this.status, message: 'Iniciando navegador WhatsApp...' });

        try {
            const authPath = path.join(APP_DIR, '.wwebjs_auth');
            const chromeExec = findChromeExecutable();

            if (chromeExec) {
                console.log(`🌐 [NAVEGADOR] Usando: ${chromeExec}`);
            } else {
                console.warn(`⚠️ [AVISO] Chrome ou Edge não encontrados nas pastas padrão. Tentando inicialização direta...`);
            }

            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: authPath
                }),
                puppeteer: {
                    headless: true,
                    executablePath: chromeExec,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu'
                    ]
                }
            });

            this.setupEventHandlers();
            await this.client.initialize();
        } catch (error) {
            console.error("❌ Falha ao inicializar WhatsApp Client:", error.message || error);
            this.status = 'ERROR';
            this.emit('status_change', { status: this.status, error: error.message });
        }
    }

    setupEventHandlers() {
        // Evento de QR Code
        this.client.on('qr', async (qr) => {
            this.currentQr = qr;
            console.log("\n📲 [QR CODE GERADO] Escaneie pelo WhatsApp no seu celular ou pelo Painel Web!");
            
            // Gera QR no terminal para compatibilidade imediata
            try {
                qrcodeTerminal.generate(qr, { small: true });
            } catch (e) {}

            try {
                // Gera imagem DataURL para o Frontend
                this.currentQrImage = await QRCode.toDataURL(qr, {
                    width: 320,
                    margin: 2,
                    color: {
                        dark: '#0F172A',
                        light: '#FFFFFF'
                    }
                });
            } catch (err) {
                console.error("Erro ao gerar QR Code DataURL:", err);
            }

            this.status = 'QR_READY';

            const qrPayload = {
                qr: this.currentQr,
                qrImage: this.currentQrImage,
                status: this.status
            };
            this.emit('qr', qrPayload);
            this.emit('status_change', qrPayload);
        });

        // Evento de Autenticação
        this.client.on('authenticated', () => {
            this.status = 'AUTHENTICATED';
            console.log("🔐 WhatsApp autenticado com sucesso!");
            const statusObj = this.getStatus();
            this.emit('authenticated', statusObj);
            this.emit('status_change', statusObj);
        });

        this.client.on('auth_failure', (msg) => {
            this.status = 'AUTH_FAILURE';
            console.error("❌ Falha de autenticação:", msg);
            this.emit('status_change', { status: this.status, error: msg });
        });

        // Evento de Conexão Pronta
        this.client.on('ready', async () => {
            this.status = 'READY';
            this.currentQr = null;
            this.currentQrImage = null;

            try {
                const info = this.client.info;
                this.userInfo = {
                    pushname: info?.pushname || 'Barbearia Bot',
                    wid: info?.wid?.user || '',
                    phone: info?.wid?.user || '',
                    platform: info?.platform || 'WhatsApp Web'
                };
            } catch (err) {
                this.userInfo = { pushname: 'Barbearia Bot', platform: 'Web' };
            }

            console.log(`🚀 [BOT ONLINE] Barbearia Bot pronto para receber agendamentos! Conectado como: ${this.userInfo.pushname} (${this.userInfo.wid})`);
            
            const statusObj = this.getStatus();
            this.emit('ready', statusObj);
            this.emit('status_change', statusObj);
        });

        // Evento de Desconexão
        this.client.on('disconnected', (reason) => {
            this.status = 'DISCONNECTED';
            this.userInfo = null;
            this.currentQr = null;
            this.currentQrImage = null;
            console.log("⚠️ WhatsApp desconectado:", reason);
            this.emit('status_change', { status: this.status, reason });
        });

        // Handler central para qualquer mensagem (clientes externos e mensagens de teste do próprio número)
        this.client.on('message_create', async (msg) => {
            await this.handleIncomingMessage(msg);
        });
    }

    async handleIncomingMessage(msg) {
        try {
            if (!msg) return;

            // 1. Ignora status/stories e broadcasts
            if (msg.isStatus || msg.broadcast || msg.from === 'status@broadcast' || msg.to === 'status@broadcast') {
                return;
            }

            const fromStr = String(msg.from || '');
            const toStr = String(msg.to || '');

            // 2. Ignora mensagens de grupos
            if (fromStr.endsWith('@g.us') || toStr.endsWith('@g.us')) {
                return;
            }

            // 3. Deduplicação de mensagens para evitar processamento duplicado
            const msgId = msg.id?._serialized || msg.id?.id;
            if (msgId) {
                if (this.processedMessages.has(msgId)) {
                    return;
                }
                this.processedMessages.add(msgId);
                if (this.processedMessages.size > 800) {
                    const first = this.processedMessages.values().next().value;
                    this.processedMessages.delete(first);
                }
            }

            const texto = (msg.body || '').trim();
            if (!texto) {
                return;
            }

            // 4. Tratamento de mensagens enviadas a partir da própria conta (fromMe: true)
            if (msg.fromMe) {
                // Se o texto for uma das respostas que o próprio bot enviou recentemente, ignora
                if (this.recentBotReplies.has(texto)) {
                    return;
                }

                // Identifica se é uma conversa consigo mesmo (ex: o usuário testando o bot pelo próprio WhatsApp)
                const myWid = this.userInfo?.wid || this.client?.info?.wid?.user || '';
                const cleanMyWid = myWid.replace(/\D/g, '');
                const cleanTo = toStr.replace(/\D/g, '');
                const cleanFrom = fromStr.replace(/\D/g, '');

                const isSelfChat = (fromStr === toStr) || 
                                   (cleanMyWid && cleanTo === cleanMyWid) || 
                                   (cleanMyWid && cleanFrom === cleanMyWid && cleanTo === cleanMyWid);

                // Se o dono estiver conversando manualmente com outra pessoa (cliente real), o bot não interfere
                if (!isSelfChat) {
                    return;
                }
                // Se for conversa consigo mesmo (teste do bot), permite o processamento!
            }

            // 5. Obtenção segura e ultra-rápida do nome do cliente
            let nome = 'Cliente';
            try {
                if (msg._data?.notifyName) {
                    nome = msg._data.notifyName;
                } else if (msg.notifyName) {
                    nome = msg.notifyName;
                } else {
                    const contact = await msg.getContact().catch(() => null);
                    if (contact && (contact.pushname || contact.name)) {
                        nome = contact.pushname || contact.name;
                    }
                }
            } catch (e) {
                nome = 'Cliente';
            }

            // Destinatário da resposta
            const targetChat = msg.fromMe ? (msg.to || msg.from) : msg.from;

            console.log(`\n📩 [WHATSAPP RECEBIDO] ${nome} (${targetChat}): "${texto}"`);

            // 6. Processamento no motor de regras do bot
            await processarMensagem({
                from: targetChat,
                nome,
                texto,
                sendMessage: async (to, content) => {
                    const destino = to || targetChat;
                    const contentTrim = (content || '').trim();

                    // Adiciona ao set de mensagens recentes do bot para prevenção de loops
                    this.recentBotReplies.add(contentTrim);
                    setTimeout(() => this.recentBotReplies.delete(contentTrim), 30000);

                    console.log(`📤 [WHATSAPP ENVIANDO] Para ${destino}: ${contentTrim.split('\n')[0]}...`);
                    
                    return await this.client.sendMessage(destino, content);
                },
                sendTyping: async () => {
                    try {
                        const chat = await msg.getChat().catch(() => null);
                        if (chat && chat.sendStateTyping) {
                            await chat.sendStateTyping();
                            await new Promise(r => setTimeout(r, 600));
                        }
                    } catch (e) {}
                },
                emitEvent: (event, data) => this.emit(event, data)
            });
        } catch (error) {
            console.error("❌ Erro ao processar mensagem do WhatsApp:", error);
        }
    }

    async restart() {
        console.log("🔄 Reiniciando cliente WhatsApp...");
        await this.initialize();
    }

    async logout() {
        try {
            if (this.client) {
                await this.client.logout();
            }
            this.status = 'DISCONNECTED';
            this.userInfo = null;
            this.currentQr = null;
            this.currentQrImage = null;
            this.emit('status_change', { status: this.status, message: 'Desconectado com sucesso' });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async sendMessage(to, message) {
        if (this.status !== 'READY' || !this.client) {
            throw new Error("WhatsApp não está conectado");
        }
        const messageTrim = (message || '').trim();
        this.recentBotReplies.add(messageTrim);
        setTimeout(() => this.recentBotReplies.delete(messageTrim), 30000);
        return await this.client.sendMessage(to, message);
    }
}

const whatsappManager = new WhatsAppManager();
module.exports = whatsappManager;
