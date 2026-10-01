// Barbearia Bot & Dashboard Frontend Engine
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Helper de Data Local (YYYY-MM-DD)
    function getTodayDateString() {
        const d = new Date();
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    // Estado da Aplicação
    const state = {
        currentTab: 'tab-qrcode',
        selectedDate: getTodayDateString(),
        daysList: [],
        services: [],
        horariosBase: [],
        config: {},
        stats: {},
        botStatus: 'DISCONNECTED',
        appointments: []
    };

    // Elementos DOM
    const elements = {
        // Navigation & Titles
        navBtns: document.querySelectorAll('.nav-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        pageTitle: document.getElementById('page-title'),
        pageSubtitle: document.getElementById('page-subtitle'),
        sidebarSalonName: document.getElementById('sidebar-salon-name'),
        liveClock: document.getElementById('live-clock'),

        // Status Sidebar & QR
        statusPulse: document.getElementById('status-pulse'),
        sidebarStatusText: document.getElementById('sidebar-status-text'),
        sidebarStatusSubtext: document.getElementById('sidebar-status-subtext'),
        qrNavBadge: document.getElementById('qr-nav-badge'),
        qrStatusPill: document.getElementById('qr-status-pill'),
        qrContainerWaiting: document.getElementById('qr-container-waiting'),
        qrContainerConnected: document.getElementById('qr-container-connected'),
        qrImage: document.getElementById('qr-image'),
        qrLoader: document.getElementById('qr-loader'),
        qrScannerLine: document.getElementById('qr-scanner-line'),
        qrProgress: document.getElementById('qr-progress'),

        // Connected Info
        userPushname: document.getElementById('user-pushname'),
        userPhone: document.getElementById('user-phone'),
        userPlatform: document.getElementById('user-platform'),
        btnRestartBot: document.getElementById('btn-restart-bot'),
        btnLogoutBot: document.getElementById('btn-logout-bot'),
        btnManualRefreshQr: document.getElementById('btn-manual-refresh-qr'),

        // Stats Cards
        statHoje: document.getElementById('stat-hoje'),
        statLivres: document.getElementById('stat-livres'),
        statTotal: document.getElementById('stat-total'),
        statFaturamento: document.getElementById('stat-faturamento'),
        todayCountBadge: document.getElementById('today-count-badge'),

        // Calendar & Slots
        calendarSelectedDateLabel: document.getElementById('calendar-selected-date-label'),
        calendarSelectedDateSub: document.getElementById('calendar-selected-date-sub'),
        btnPrevDay: document.getElementById('btn-prev-day'),
        btnNextDay: document.getElementById('btn-next-day'),
        quickDaysContainer: document.getElementById('quick-days-container'),
        slotsGridContainer: document.getElementById('slots-grid-container'),
        calendarClosedAlert: document.getElementById('calendar-closed-alert'),
        calendarClosedReason: document.getElementById('calendar-closed-reason'),
        btnQuickReopen: document.getElementById('btn-quick-reopen'),

        // Appointments Table
        searchAppointments: document.getElementById('search-appointments'),
        filterStatus: document.getElementById('filter-status'),
        filterDate: document.getElementById('filter-date'),
        appointmentsTableBody: document.getElementById('appointments-table-body'),

        // Simulator & Logs
        simBarberTitle: document.getElementById('sim-barber-title'),
        simMessagesBody: document.getElementById('sim-messages-body'),
        simInput: document.getElementById('sim-input'),
        btnSimSend: document.getElementById('btn-sim-send'),
        logsConsole: document.getElementById('logs-console'),
        btnClearLogs: document.getElementById('btn-clear-logs'),

        // Config Geral
        formConfigGeral: document.getElementById('form-config-geral'),
        cfgNome: document.getElementById('cfg-nome'),
        cfgDono: document.getElementById('cfg-dono'),
        cfgEndereco: document.getElementById('cfg-endereco'),
        cfgPix: document.getElementById('cfg-pix'),

        // Modo Hoje Estamos Fechados
        cardStatusFuncionamento: document.getElementById('card-status-funcionamento'),
        badgeStatusFechado: document.getElementById('badge-status-fechado'),
        txtBadgeStatusFechado: document.getElementById('txt-badge-status-fechado'),
        cfgMotivoFechado: document.getElementById('cfg-motivo-fechado'),
        btnToggleFechadoHoje: document.getElementById('btn-toggle-fechado-hoje'),
        txtBtnToggleFechado: document.getElementById('txt-btn-toggle-fechado'),

        // Vagas & Horários Base Editor
        vagasCountBadge: document.getElementById('vagas-count-badge'),
        slotsCountNumber: document.getElementById('slots-count-number'),
        preset12Vagas: document.getElementById('preset-12-vagas'),
        preset8Vagas: document.getElementById('preset-8-vagas'),
        preset15Vagas: document.getElementById('preset-15-vagas'),
        preset30Min: document.getElementById('preset-30min'),
        inputNewTime: document.getElementById('input-new-time'),
        btnAddSlotTime: document.getElementById('btn-add-slot-time'),
        slotsChipsContainer: document.getElementById('slots-chips-container'),
        workingDaysContainer: document.getElementById('working-days-container'),
        btnSaveSlots: document.getElementById('btn-save-slots'),

        // Services
        servicesListContainer: document.getElementById('services-list-container'),
        btnAddService: document.getElementById('btn-add-service'),

        // Modal
        btnModalNovoAgendamento: document.getElementById('btn-modal-novo-agendamento'),
        modalAgendamento: document.getElementById('modal-agendamento'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        btnCancelModal: document.getElementById('btn-cancel-modal'),
        formNovoAgendamento: document.getElementById('form-novo-agendamento'),
        modalCliente: document.getElementById('modal-cliente'),
        modalTelefone: document.getElementById('modal-telefone'),
        modalData: document.getElementById('modal-data'),
        modalHorario: document.getElementById('modal-horario'),
        modalServico: document.getElementById('modal-servico'),

        // Global Refresh & Toast
        btnRefreshAll: document.getElementById('btn-refresh-all'),
        toastContainer: document.getElementById('toast-container')
    };

    // ------------------------------------------------------------------
    // Socket.io Connection & Event Handling (com fallback robusto)
    // ------------------------------------------------------------------
    let socket = null;
    try {
        if (typeof io !== 'undefined') {
            socket = io({
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                timeout: 10000
            });

            socket.on('connect', () => {
                addLog('system', 'Conectado ao servidor Socket.io');
                fetchStatus();
            });

            socket.on('status_change', (data) => {
                updateBotStatusUI(data);
            });

            socket.on('qr', (data) => {
                updateQrUI(data);
            });

            socket.on('ready', (data) => {
                updateBotStatusUI({ status: 'READY', userInfo: data.userInfo });
                showToast('WhatsApp conectado com sucesso!', 'success');
                refreshData();
            });

            socket.on('novo_agendamento', (ag) => {
                showToast(`🎉 Novo agendamento: ${ag.cliente} (${ag.horario})`, 'success');
                addLog('saida', `Novo agendamento confirmado para ${ag.cliente} às ${ag.horario}`);
                refreshData();
                playNotificationSound();
            });

            socket.on('agendamento_cancelado', (ag) => {
                showToast(`⚠️ Agendamento cancelado: ${ag.cliente} (${ag.horario})`, 'info');
                addLog('system', `Agendamento cancelado: ${ag.cliente} às ${ag.horario}`);
                refreshData();
            });

            socket.on('agendamento_atualizado', () => {
                refreshData();
            });

            socket.on('bot_log', (log) => {
                addLog(log.tipo, `${log.cliente ? `[${log.cliente}] ` : ''}${log.detalhe}`);
            });

            socket.on('stats_update', (stats) => {
                updateStatsUI(stats);
            });

            socket.on('config_atualizada', (cfg) => {
                state.config = cfg;
                applyConfigToUI(cfg, false);
            });
        }
    } catch (e) {
        console.warn("Socket.io não disponível, operando em modo polling REST:", e);
    }

    // ------------------------------------------------------------------
    // UI Helpers & Clock
    // ------------------------------------------------------------------
    function updateClock() {
        const now = new Date();
        elements.liveClock.textContent = now.toLocaleTimeString('pt-BR');
    }
    setInterval(updateClock, 1000);
    updateClock();

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconName = 'info';
        if (type === 'success') iconName = 'check-circle';
        if (type === 'error') iconName = 'alert-triangle';

        toast.innerHTML = `
            <i data-lucide="${iconName}"></i>
            <span>${message}</span>
        `;
        elements.toastContainer.appendChild(toast);
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function playNotificationSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        } catch (e) {}
    }

    function addLog(tipo, text) {
        const entry = document.createElement('div');
        entry.className = `log-entry ${tipo}`;
        const time = new Date().toLocaleTimeString('pt-BR');
        entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-text">${escapeHtml(text)}</span>`;
        elements.logsConsole.appendChild(entry);
        elements.logsConsole.scrollTop = elements.logsConsole.scrollHeight;
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    // ------------------------------------------------------------------
    // QR Code & Status UI Updates (Tripla camada de renderização)
    // ------------------------------------------------------------------
    function updateQrUI(data) {
        if (!data) return;

        // Fonte da imagem do QR: dataURL ou endpoint direto /api/qr.png
        const qrSrc = data.qrImage || (data.qr ? `/api/qr.png?t=${Date.now()}` : `/api/qr.png?t=${Date.now()}`);

        if (data.qrImage || data.qr || data.status === 'QR_READY') {
            elements.qrImage.onload = () => {
                elements.qrImage.classList.remove('hidden');
                elements.qrLoader.classList.add('hidden');
                elements.qrScannerLine.classList.remove('hidden');
            };

            elements.qrImage.onerror = () => {
                // Se falhar o dataURL, tenta via endpoint direto da API
                if (!elements.qrImage.src.includes('/api/qr.png')) {
                    elements.qrImage.src = `/api/qr.png?t=${Date.now()}`;
                }
            };

            elements.qrImage.src = qrSrc;
            elements.qrImage.classList.remove('hidden');
            elements.qrLoader.classList.add('hidden');
            elements.qrScannerLine.classList.remove('hidden');

            elements.qrProgress.style.width = '100%';
            setTimeout(() => {
                elements.qrProgress.style.transition = 'width 20s linear';
                elements.qrProgress.style.width = '0%';
            }, 100);
        }

        elements.qrContainerWaiting.classList.remove('hidden');
        elements.qrContainerConnected.classList.add('hidden');

        elements.qrStatusPill.className = 'connection-status-pill';
        elements.qrStatusPill.innerHTML = `<span class="pill-dot"></span><span class="pill-text">QR Pronto para Leitura</span>`;
    }

    function updateBotStatusUI(data) {
        if (!data) return;
        state.botStatus = data.status || 'DISCONNECTED';

        if (state.botStatus === 'READY' || state.botStatus === 'AUTHENTICATED') {
            elements.statusPulse.className = 'status-pulse-dot online';
            elements.sidebarStatusText.textContent = 'Bot Online';
            elements.sidebarStatusSubtext.textContent = 'Respondendo via WhatsApp';

            elements.qrNavBadge.textContent = 'ONLINE';
            elements.qrNavBadge.className = 'nav-badge';
            elements.qrNavBadge.style.background = 'var(--accent-emerald)';
            elements.qrNavBadge.style.color = '#000';

            elements.qrContainerWaiting.classList.add('hidden');
            elements.qrContainerConnected.classList.remove('hidden');
            elements.qrLoader.classList.add('hidden');

            const info = data.userInfo || {};
            elements.userPushname.textContent = info.pushname || 'Barbearia';
            elements.userPhone.textContent = info.phone ? `+${info.phone}` : (info.wid ? `+${info.wid}` : 'Conectado');
            elements.userPlatform.textContent = info.platform || 'WhatsApp Web';

            elements.qrStatusPill.className = 'connection-status-pill online';
            elements.qrStatusPill.innerHTML = `<span class="pill-dot"></span><span class="pill-text">🟢 Conectado & Online</span>`;

        } else if (state.botStatus === 'QR_READY') {
            elements.statusPulse.className = 'status-pulse-dot';
            elements.sidebarStatusText.textContent = 'Aguardando QR';
            elements.sidebarStatusSubtext.textContent = 'Escaneie pelo celular';
            elements.qrNavBadge.textContent = 'QR';
            elements.qrNavBadge.style.background = 'var(--primary)';
            elements.qrNavBadge.style.color = '#000';

            updateQrUI(data);

        } else if (state.botStatus === 'INITIALIZING') {
            elements.statusPulse.className = 'status-pulse-dot';
            elements.sidebarStatusText.textContent = 'Iniciando...';
            elements.sidebarStatusSubtext.textContent = 'Abrindo navegador';
            elements.qrNavBadge.textContent = 'INIC';
            elements.qrNavBadge.style.background = 'var(--primary)';
            elements.qrNavBadge.style.color = '#000';

            elements.qrContainerWaiting.classList.remove('hidden');
            elements.qrContainerConnected.classList.add('hidden');
            elements.qrLoader.classList.remove('hidden');
            elements.qrImage.classList.add('hidden');
            elements.qrScannerLine.classList.add('hidden');

            elements.qrStatusPill.className = 'connection-status-pill';
            elements.qrStatusPill.innerHTML = `<span class="pill-dot"></span><span class="pill-text">Iniciando WhatsApp...</span>`;

        } else {
            elements.statusPulse.className = 'status-pulse-dot offline';
            elements.sidebarStatusText.textContent = 'Desconectado';
            elements.sidebarStatusSubtext.textContent = 'Clique para reiniciar';
            elements.qrNavBadge.textContent = 'OFF';
            elements.qrNavBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            elements.qrNavBadge.style.color = '#EF4444';

            elements.qrContainerWaiting.classList.remove('hidden');
            elements.qrContainerConnected.classList.add('hidden');
            elements.qrStatusPill.className = 'connection-status-pill';
            elements.qrStatusPill.innerHTML = `<span class="pill-dot"></span><span class="pill-text">Desconectado</span>`;
        }
    }

    function updateStatsUI(stats) {
        if (!stats) return;
        state.stats = stats;
        elements.statHoje.textContent = stats.agendamentosHoje || 0;
        elements.statLivres.textContent = stats.horariosLivresHoje || 0;
        elements.statTotal.textContent = stats.totalConfirmados || 0;
        elements.statFaturamento.textContent = `R$ ${(stats.faturamentoEstimado || 0).toFixed(2)}`;
        elements.todayCountBadge.textContent = stats.agendamentosHoje || 0;
    }

    // ------------------------------------------------------------------
    // Configurações & Modo Fechado Hoje
    // ------------------------------------------------------------------
    function updateClosedStatusUI(isClosed, motivo = '') {
        const closed = Boolean(isClosed);
        if (closed) {
            elements.badgeStatusFechado.className = 'closed-status-pill closed';
            elements.txtBadgeStatusFechado.textContent = '🛑 Salão FECHADO Hoje';
            elements.cardStatusFuncionamento.classList.add('is-closed');
            elements.txtBtnToggleFechado.textContent = '🟢 Reabrir Salão Hoje';
            elements.btnToggleFechadoHoje.className = 'btn btn-success-solid';

            // Alerta no Calendário se a data selecionada for hoje
            if (state.selectedDate === getTodayDateString()) {
                elements.calendarClosedAlert.classList.remove('hidden');
                if (elements.calendarClosedReason) {
                    elements.calendarClosedReason.textContent = `Atendimento suspenso (${motivo || 'Pausado pelo administrador'}). O bot no WhatsApp está bloqueando agendamentos para hoje e direcionando para os próximos dias.`;
                }
            } else {
                elements.calendarClosedAlert.classList.add('hidden');
            }
        } else {
            elements.badgeStatusFechado.className = 'closed-status-pill open';
            elements.txtBadgeStatusFechado.textContent = '🟢 Salão Aberto Hoje';
            elements.cardStatusFuncionamento.classList.remove('is-closed');
            elements.txtBtnToggleFechado.textContent = '🛑 Ativar Modo: HOJE ESTAMOS FECHADOS';
            elements.btnToggleFechadoHoje.className = 'btn btn-danger-solid';
            elements.calendarClosedAlert.classList.add('hidden');
        }
    }

    function renderWorkingDays(diasSemana) {
        const checkboxes = elements.workingDaysContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const dayNum = cb.getAttribute('data-day');
            cb.checked = Boolean(diasSemana && diasSemana[dayNum]);
        });
    }

    function renderSlotsChips(horarios) {
        elements.slotsChipsContainer.innerHTML = '';
        const sorted = [...horarios].sort();
        state.horariosBase = sorted;

        const count = sorted.length;
        elements.vagasCountBadge.textContent = `${count} Vagas Diárias`;
        elements.slotsCountNumber.textContent = count;

        if (sorted.length === 0) {
            elements.slotsChipsContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum horário cadastrado. Adicione horários acima.</span>`;
            return;
        }

        sorted.forEach(hora => {
            const chip = document.createElement('div');
            chip.className = 'slot-time-chip';
            chip.innerHTML = `
                <span>⏰ ${hora}</span>
                <button type="button" class="btn-remove-chip" title="Remover horário" onclick="removerHorarioSlot('${hora}')">✕</button>
            `;
            elements.slotsChipsContainer.appendChild(chip);
        });
    }

    window.removerHorarioSlot = function(hora) {
        state.horariosBase = state.horariosBase.filter(h => h !== hora);
        renderSlotsChips(state.horariosBase);
    };

    function applyConfigToUI(config, force = false) {
        if (!config) return;
        state.config = config;
        if (elements.sidebarSalonName) elements.sidebarSalonName.textContent = config.nomeSalao || 'Barbearia';
        if (elements.simBarberTitle) elements.simBarberTitle.textContent = config.nomeSalao || 'Barbearia';

        // Previne sobrescrever o que o usuário está digitando caso não seja ação forçada (ex: salvar)
        const isFocused = (el) => el && (document.activeElement === el);
        const isFormFocused = elements.formConfigGeral && elements.formConfigGeral.contains(document.activeElement);

        if (force || !isFormFocused) {
            if (elements.cfgNome && (force || !isFocused(elements.cfgNome))) {
                elements.cfgNome.value = config.nomeSalao || '';
            }
            if (elements.cfgDono && (force || !isFocused(elements.cfgDono))) {
                elements.cfgDono.value = config.numeroDono ? config.numeroDono.replace('@c.us', '') : '';
            }
            if (elements.cfgEndereco && (force || !isFocused(elements.cfgEndereco))) {
                elements.cfgEndereco.value = config.endereco || '';
            }
            if (elements.cfgPix && (force || !isFocused(elements.cfgPix))) {
                elements.cfgPix.value = config.chavePix || '';
            }
            if (elements.cfgMotivoFechado && (force || !isFocused(elements.cfgMotivoFechado))) {
                elements.cfgMotivoFechado.value = config.motivoFechado || '';
            }
        }

        // Status Fechado Hoje
        updateClosedStatusUI(config.fechadoHoje, config.motivoFechado);

        // Vagas e Horários Base
        if (force || !isFocused(elements.inputNewTime)) {
            state.horariosBase = Array.isArray(config.horariosBase) ? [...config.horariosBase] : [
                "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
            ];
            renderSlotsChips(state.horariosBase);
            renderWorkingDays(config.diasSemana || { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" });
        }

        state.services = Array.isArray(config.servicos) ? config.servicos : [];
        renderServicesList(state.services);
        populateServiceSelect(state.services);
    }

    // ------------------------------------------------------------------
    // Eventos: Modo Fechado Hoje & Editor de Vagas
    // ------------------------------------------------------------------
    async function toggleFechadoHoje() {
        const isCurrentlyClosed = Boolean(state.config.fechadoHoje);
        const novoStatus = !isCurrentlyClosed;
        const motivo = elements.cfgMotivoFechado.value.trim() || 'Folga da equipe';

        if (novoStatus) {
            if (!confirm('Deseja realmente ativar o modo "HOJE ESTAMOS FECHADOS"? As vagas de hoje serão suspensas no bot e no painel.')) return;
        }

        try {
            const res = await fetch('/api/config/fechado-hoje', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fechado: novoStatus,
                    motivo: motivo
                })
            });
            const result = await res.json();
            if (result.success) {
                state.config = result.config;
                updateClosedStatusUI(result.fechadoHoje, result.motivoFechado);
                showToast(novoStatus ? '🛑 Salão marcado como FECHADO hoje!' : '🟢 Salão REABERTO com sucesso!', novoStatus ? 'info' : 'success');
                refreshData();
            }
        } catch (err) {
            showToast('Erro ao alterar status de fechamento.', 'error');
        }
    }

    elements.btnToggleFechadoHoje.addEventListener('click', toggleFechadoHoje);
    if (elements.btnQuickReopen) {
        elements.btnQuickReopen.addEventListener('click', toggleFechadoHoje);
    }

    // Adicionar Novo Horário
    elements.btnAddSlotTime.addEventListener('click', () => {
        const newTime = elements.inputNewTime.value;
        if (!newTime) return;

        if (state.horariosBase.includes(newTime)) {
            showToast('Este horário já está na lista!', 'info');
            return;
        }

        state.horariosBase.push(newTime);
        renderSlotsChips(state.horariosBase);
        showToast(`Horário ${newTime} adicionado! Clique em "Salvar Horários & Vagas Diárias" para aplicar.`, 'success');
    });

    // Presets Rápidos
    elements.preset12Vagas.addEventListener('click', () => {
        state.horariosBase = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];
        renderSlotsChips(state.horariosBase);
        showToast('Predefinição de 12 Vagas (09h às 21h) aplicada!', 'info');
    });

    elements.preset8Vagas.addEventListener('click', () => {
        state.horariosBase = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
        renderSlotsChips(state.horariosBase);
        showToast('Predefinição de 8 Vagas (09h às 18h) aplicada!', 'info');
    });

    elements.preset15Vagas.addEventListener('click', () => {
        state.horariosBase = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];
        renderSlotsChips(state.horariosBase);
        showToast('Predefinição de 15 Vagas (08h às 22h) aplicada!', 'info');
    });

    elements.preset30Min.addEventListener('click', () => {
        state.horariosBase = [
            "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
            "13:30", "14:00", "14:30", "15:00", "15:30", "16:00",
            "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"
        ];
        renderSlotsChips(state.horariosBase);
        showToast('Predefinição de Intervalo 30min (18 Vagas) aplicada!', 'info');
    });

    // Salvar Vagas e Horários Base
    elements.btnSaveSlots.addEventListener('click', async () => {
        const diasSemana = {};
        const checkboxes = elements.workingDaysContainer.querySelectorAll('input[type="checkbox"]');
        const nomesDias = {
            '0': 'Domingo',
            '1': 'Segunda',
            '2': 'Terça',
            '3': 'Quarta',
            '4': 'Quinta',
            '5': 'Sexta',
            '6': 'Sábado'
        };

        checkboxes.forEach(cb => {
            if (cb.checked) {
                const dayNum = cb.getAttribute('data-day');
                diasSemana[dayNum] = nomesDias[dayNum];
            }
        });

        if (state.horariosBase.length === 0) {
            showToast('Cadastre ao menos um horário de atendimento!', 'error');
            return;
        }

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    horariosBase: state.horariosBase,
                    diasSemana
                })
            });
            const result = await res.json();
            if (result.success) {
                showToast(`✅ ${state.horariosBase.length} Vagas Diárias e Horários Salvos com Sucesso!`, 'success');
                refreshData();
            }
        } catch (err) {
            showToast('Erro ao salvar horários de atendimento.', 'error');
        }
    });

    // ------------------------------------------------------------------
    // Tab Navigation
    // ------------------------------------------------------------------
    const tabHeaders = {
        'tab-qrcode': { title: 'Conexão WhatsApp & QR Code', sub: 'Escaneie o código para sincronizar o bot em tempo real' },
        'tab-calendar': { title: 'Agenda & Horários Disponíveis', sub: 'Visão de horários com sistema anti-colisão em tempo real' },
        'tab-appointments': { title: 'Todos os Agendamentos', sub: 'Gestão completa de clientes, status e atendimentos' },
        'tab-simulator': { title: 'Simulador WhatsApp & Logs', sub: 'Teste as respostas do bot e monitore eventos em tempo real' },
        'tab-settings': { title: 'Serviços & Configurações', sub: 'Edite o número de vagas, horários, modo fechado, valores e dados do salão' }
    };

    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    function switchTab(tabId) {
        state.currentTab = tabId;

        elements.navBtns.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
        });

        elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });

        if (tabHeaders[tabId]) {
            elements.pageTitle.textContent = tabHeaders[tabId].title;
            elements.pageSubtitle.textContent = tabHeaders[tabId].sub;
        }

        if (tabId === 'tab-calendar') {
            loadSlotsForDate(state.selectedDate);
            loadDaysList();
        } else if (tabId === 'tab-appointments') {
            loadAppointments();
        }
    }

    // ------------------------------------------------------------------
    // Calendar & Slots View
    // ------------------------------------------------------------------
    async function loadDaysList() {
        try {
            const res = await fetch('/api/days');
            const days = await res.json();
            state.daysList = days;
            renderDaysPills(days);
        } catch (e) {
            console.error("Erro ao carregar dias:", e);
        }
    }

    function renderDaysPills(days) {
        elements.quickDaysContainer.innerHTML = '';
        const hojeStr = getTodayDateString();
        const fechadoHoje = Boolean(state.config.fechadoHoje);

        days.forEach((day) => {
            const pill = document.createElement('div');
            const isHoje = (day.dataStr === hojeStr);
            const isClosed = isHoje && fechadoHoje;

            pill.className = `day-pill ${day.dataStr === state.selectedDate ? 'active' : ''} ${isClosed ? 'closed' : ''}`;
            
            let vagasHtml = `<span class="pill-vagas">${day.vagasDisponiveis} vagas</span>`;
            if (isClosed) {
                vagasHtml = `<span class="pill-vagas" style="color: #F87171;">🔴 Fechado</span>`;
            }

            const dataPart = day.rotulo.includes('(') ? day.rotulo.split('(')[1].replace(')', '') : day.dataStr;

            pill.innerHTML = `
                <span class="pill-day-name">${day.nomeDia}</span>
                <span class="pill-day-date">${dataPart}</span>
                ${vagasHtml}
            `;

            pill.addEventListener('click', () => {
                state.selectedDate = day.dataStr;
                updateSelectedDateHeader();
                document.querySelectorAll('.day-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                loadSlotsForDate(state.selectedDate);
            });

            elements.quickDaysContainer.appendChild(pill);
        });
    }

    function updateSelectedDateHeader() {
        const [ano, mes, dia] = state.selectedDate.split('-').map(Number);
        const dataObj = new Date(ano, mes - 1, dia);

        const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        const hojeStr = getTodayDateString();
        const prefix = state.selectedDate === hojeStr ? 'Hoje, ' : '';

        elements.calendarSelectedDateLabel.textContent = `${prefix}${diasSemana[dataObj.getDay()]}`;
        elements.calendarSelectedDateSub.textContent = `${String(dia).padStart(2, '0')} de ${meses[mes - 1]} de ${ano}`;
    }

    async function loadSlotsForDate(dateStr) {
        try {
            updateSelectedDateHeader();
            const hojeStr = getTodayDateString();
            const isHoje = (dateStr === hojeStr);

            if (isHoje && state.config.fechadoHoje) {
                elements.calendarClosedAlert.classList.remove('hidden');
                if (elements.calendarClosedReason) {
                    elements.calendarClosedReason.textContent = `Atendimento presencial suspenso (${state.config.motivoFechado || 'Folga da equipe'}). Clientes no WhatsApp estão sendo orientados a agendar para os próximos dias.`;
                }
            } else {
                elements.calendarClosedAlert.classList.add('hidden');
            }

            const res = await fetch(`/api/slots?date=${dateStr}`);
            const data = await res.json();
            renderSlotsGrid(data.slots);
        } catch (err) {
            console.error("Erro ao carregar slots:", err);
        }
    }

    function renderSlotsGrid(slots) {
        elements.slotsGridContainer.innerHTML = '';

        if (!slots || slots.length === 0) {
            elements.slotsGridContainer.innerHTML = `<div class="glass-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 32px;">Nenhum horário disponível para esta data.</div>`;
            return;
        }

        slots.forEach(slot => {
            const card = document.createElement('div');
            const isOccupied = slot.ocupado;

            card.className = `slot-card ${isOccupied ? 'occupied' : 'available'}`;

            if (isOccupied && slot.agendamento) {
                const ag = slot.agendamento;
                card.innerHTML = `
                    <div class="slot-card-header">
                        <span class="slot-time">⏰ ${slot.horario}</span>
                        <span class="slot-badge occupied">Reservado</span>
                    </div>
                    <div class="slot-client-info">
                        <strong>👤 ${ag.cliente}</strong>
                        <span>📱 ${ag.telefone.replace('@c.us', '')}</span>
                        <span class="slot-service-tag">${ag.servico} (R$ ${(ag.preco || 0).toFixed(2)})</span>
                    </div>
                    <div class="slot-actions">
                        <button class="btn btn-danger-outline btn-sm" onclick="cancelarAgendamento('${ag.id}')">
                            <i data-lucide="x"></i> Cancelar
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="concluirAgendamento('${ag.id}')">
                            <i data-lucide="check"></i> Concluir
                        </button>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="slot-card-header">
                        <span class="slot-time">⏰ ${slot.horario}</span>
                        <span class="slot-badge available">Livre</span>
                    </div>
                    <div class="slot-client-info">
                        <strong>🛡️ Vaga Disponível</strong>
                        <span>Pronto para agendamento via WhatsApp ou balcão</span>
                    </div>
                    <div class="slot-actions">
                        <button class="btn btn-primary btn-sm" onclick="abrirModalAgendamentoParaHorario('${slot.horario}')">
                            <i data-lucide="plus"></i> Agendar Cliente
                        </button>
                    </div>
                `;
            }

            elements.slotsGridContainer.appendChild(card);
        });

        if (window.lucide) lucide.createIcons();
    }

    elements.btnPrevDay.addEventListener('click', () => {
        changeDay(-1);
    });

    elements.btnNextDay.addEventListener('click', () => {
        changeDay(1);
    });

    function changeDay(delta) {
        const [ano, mes, dia] = state.selectedDate.split('-').map(Number);
        const dataObj = new Date(ano, mes - 1, dia);
        dataObj.setDate(dataObj.getDate() + delta);
        
        const a = dataObj.getFullYear();
        const m = String(dataObj.getMonth() + 1).padStart(2, '0');
        const d = String(dataObj.getDate()).padStart(2, '0');
        state.selectedDate = `${a}-${m}-${d}`;

        loadSlotsForDate(state.selectedDate);
        loadDaysList();
    }

    // ------------------------------------------------------------------
    // Appointments Table
    // ------------------------------------------------------------------
    async function loadAppointments() {
        const busca = elements.searchAppointments.value;
        const status = elements.filterStatus.value;
        const data = elements.filterDate.value;

        const params = new URLSearchParams();
        if (busca) params.append('busca', busca);
        if (status) params.append('status', status);
        if (data) params.append('data', data);

        try {
            const res = await fetch(`/api/appointments?${params.toString()}`);
            const ags = await res.json();
            state.appointments = ags;
            renderAppointmentsTable(ags);
        } catch (err) {
            console.error("Erro ao carregar agendamentos:", err);
        }
    }

    function renderAppointmentsTable(ags) {
        elements.appointmentsTableBody.innerHTML = '';

        if (!ags || ags.length === 0) {
            elements.appointmentsTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">Nenhum agendamento encontrado.</td></tr>`;
            return;
        }

        ags.forEach(ag => {
            const tr = document.createElement('tr');
            const [ano, mes, dia] = ag.data.split('-');
            const dataFormatada = `${dia}/${mes}/${ano}`;

            let statusBadge = `<span class="badge-status ${ag.status}">${ag.status.toUpperCase()}</span>`;

            tr.innerHTML = `
                <td><strong>${dataFormatada}</strong> às ${ag.horario}</td>
                <td><strong>${ag.cliente}</strong></td>
                <td>${ag.telefone.replace('@c.us', '')}</td>
                <td>${ag.servico}</td>
                <td>R$ ${(ag.preco || 0).toFixed(2)}</td>
                <td><span class="badge-pro" style="background: var(--bg-surface-elevated); color: var(--text-secondary);">${ag.origem || 'whatsapp'}</span></td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        ${ag.status === 'confirmado' ? `
                            <button class="btn btn-secondary btn-sm" onclick="concluirAgendamento('${ag.id}')" title="Marcar como atendido">
                                <i data-lucide="check"></i>
                            </button>
                            <button class="btn btn-danger-outline btn-sm" onclick="cancelarAgendamento('${ag.id}')" title="Cancelar agendamento">
                                <i data-lucide="trash-2"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;

            elements.appointmentsTableBody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    elements.searchAppointments.addEventListener('input', debounce(loadAppointments, 300));
    elements.filterStatus.addEventListener('change', loadAppointments);
    elements.filterDate.addEventListener('change', loadAppointments);

    // ------------------------------------------------------------------
    // Actions: Cancel & Conclude
    // ------------------------------------------------------------------
    window.cancelarAgendamento = async function(id) {
        if (!confirm('Deseja realmente cancelar este agendamento? O horário será liberado imediatamente.')) return;

        try {
            const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                showToast('Agendamento cancelado com sucesso. Horário liberado!', 'info');
                refreshData();
            } else {
                showToast(result.error || 'Erro ao cancelar', 'error');
            }
        } catch (err) {
            showToast('Erro de comunicação', 'error');
        }
    };

    window.concluirAgendamento = async function(id) {
        try {
            const res = await fetch(`/api/appointments/${id}/concluir`, { method: 'PUT' });
            const result = await res.json();
            if (result.success) {
                showToast('Atendimento concluído!', 'success');
                refreshData();
            }
        } catch (err) {
            showToast('Erro de comunicação', 'error');
        }
    };

    // ------------------------------------------------------------------
    // WhatsApp Simulator
    // ------------------------------------------------------------------
    async function sendSimulatorMessage() {
        const msg = elements.simInput.value.trim();
        if (!msg) return;

        appendChatBubble('outgoing', msg);
        elements.simInput.value = '';

        try {
            const res = await fetch('/api/simulator/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mensagem: msg,
                    telefone: '5511999998888@c.us',
                    nome: 'Cliente Simulador'
                })
            });

            const data = await res.json();
            if (data.success && data.respostas) {
                data.respostas.forEach(r => {
                    appendChatBubble('incoming', r.texto);
                });
            }
        } catch (err) {
            appendChatBubble('incoming', '❌ Erro ao processar mensagem no simulador.');
        }
    }

    function appendChatBubble(type, text) {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${type}`;
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        bubble.innerHTML = `
            <div class="bubble-text">${escapeHtml(text)}</div>
            <span class="bubble-time">${time}</span>
        `;

        elements.simMessagesBody.appendChild(bubble);
        elements.simMessagesBody.scrollTop = elements.simMessagesBody.scrollHeight;
    }

    elements.btnSimSend.addEventListener('click', sendSimulatorMessage);
    elements.simInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendSimulatorMessage();
    });

    elements.btnClearLogs.addEventListener('click', () => {
        elements.logsConsole.innerHTML = '';
    });

    // ------------------------------------------------------------------
    // Modal Novo Agendamento
    // ------------------------------------------------------------------
    elements.btnModalNovoAgendamento.addEventListener('click', () => {
        abrirModalAgendamentoParaHorario();
    });

    window.abrirModalAgendamentoParaHorario = async function(horarioSugerido = '') {
        elements.modalData.value = state.selectedDate;
        await atualizarHorariosModal(state.selectedDate, horarioSugerido);
        elements.modalAgendamento.classList.remove('hidden');
    };

    elements.btnCloseModal.addEventListener('click', () => elements.modalAgendamento.classList.add('hidden'));
    elements.btnCancelModal.addEventListener('click', () => elements.modalAgendamento.classList.add('hidden'));

    elements.modalData.addEventListener('change', async () => {
        await atualizarHorariosModal(elements.modalData.value);
    });

    async function atualizarHorariosModal(dataStr, horarioPreSelecionado = '') {
        try {
            const res = await fetch(`/api/slots?date=${dataStr}`);
            const data = await res.json();
            elements.modalHorario.innerHTML = '';

            const livres = (data.slots || []).filter(s => s.disponivel);

            if (livres.length === 0) {
                elements.modalHorario.innerHTML = '<option value="">Nenhum horário livre para esta data</option>';
                return;
            }

            livres.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.horario;
                opt.textContent = `⏰ ${s.horario} (Livre)`;
                if (s.horario === horarioPreSelecionado) opt.selected = true;
                elements.modalHorario.appendChild(opt);
            });
        } catch (e) {
            console.error(e);
        }
    }

    function populateServiceSelect(services) {
        elements.modalServico.innerHTML = '';
        services.forEach(s => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify(s);
            opt.textContent = `${s.icone || '✂️'} ${s.nome} — R$ ${s.preco.toFixed(2)}`;
            elements.modalServico.appendChild(opt);
        });
    }

    elements.formNovoAgendamento.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cliente = elements.modalCliente.value.trim();
        const telefone = elements.modalTelefone.value.trim() || '11999999999';
        const data = elements.modalData.value;
        const horario = elements.modalHorario.value;
        const servicoObj = JSON.parse(elements.modalServico.value || '{}');

        if (!data || !horario) {
            showToast('Selecione uma data e horário válidos!', 'error');
            return;
        }

        try {
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente,
                    telefone,
                    data,
                    horario,
                    servico: servicoObj.nome || 'Corte Tradicional',
                    preco: servicoObj.preco || 35
                })
            });

            const result = await res.json();
            if (result.success) {
                showToast('Agendamento criado com sucesso!', 'success');
                elements.modalAgendamento.classList.add('hidden');
                elements.formNovoAgendamento.reset();
                refreshData();
            } else {
                showToast(result.error || 'Horário indisponível!', 'error');
            }
        } catch (err) {
            showToast('Erro ao criar agendamento.', 'error');
        }
    });

    // ------------------------------------------------------------------
    // Serviços List
    // ------------------------------------------------------------------
    function renderServicesList(services) {
        elements.servicesListContainer.innerHTML = '';
        services.forEach((s) => {
            const row = document.createElement('div');
            row.className = 'service-item-row';
            row.innerHTML = `
                <span class="service-item-icon">${s.icone || '✂️'}</span>
                <div class="service-item-info">
                    <strong>${s.nome}</strong>
                    <span>Duração: ${s.duracao || '30 min'}</span>
                </div>
                <div class="service-item-price">R$ ${s.preco.toFixed(2)}</div>
                <button class="btn btn-danger-outline btn-sm" onclick="removerServico(${s.id})">
                    <i data-lucide="trash"></i>
                </button>
            `;
            elements.servicesListContainer.appendChild(row);
        });
        if (window.lucide) lucide.createIcons();
    }

    window.removerServico = function(id) {
        state.services = state.services.filter(s => s.id !== id);
        renderServicesList(state.services);
        salvarConfiguracoesGerais();
    };

    elements.btnAddService.addEventListener('click', () => {
        const nome = prompt('Nome do Serviço (ex: Barboterapia Especial):');
        if (!nome) return;
        const preco = parseFloat(prompt('Valor do Serviço (ex: 45):') || '0');
        const duracao = prompt('Duração média (ex: 45 min):') || '45 min';

        const novo = {
            id: Date.now(),
            nome,
            preco: preco || 35,
            duracao,
            icone: '💈'
        };

        state.services.push(novo);
        renderServicesList(state.services);
        salvarConfiguracoesGerais();
    });

    elements.formConfigGeral.addEventListener('submit', (e) => {
        e.preventDefault();
        salvarConfiguracoesGerais();
    });

    async function salvarConfiguracoesGerais() {
        const btnSubmit = elements.formConfigGeral.querySelector('button[type="submit"]');
        let originalBtnHtml = '';
        if (btnSubmit) {
            originalBtnHtml = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Salvando...`;
            if (window.lucide) lucide.createIcons();
        }

        let rawPhone = elements.cfgDono.value.trim().replace(/\D/g, '');
        if (rawPhone && !rawPhone.startsWith('55') && (rawPhone.length === 10 || rawPhone.length === 11)) {
            rawPhone = '55' + rawPhone;
        }

        const configData = {
            nomeSalao: elements.cfgNome.value.trim() || 'Barbearia',
            numeroDono: rawPhone ? `${rawPhone}@c.us` : '',
            endereco: elements.cfgEndereco.value.trim(),
            chavePix: elements.cfgPix.value.trim(),
            motivoFechado: elements.cfgMotivoFechado ? elements.cfgMotivoFechado.value.trim() : (state.config.motivoFechado || ''),
            servicos: state.services,
            horariosBase: state.horariosBase,
            diasSemana: state.config.diasSemana
        };

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configData)
            });
            const result = await res.json();
            if (result.success) {
                state.config = result.config;
                applyConfigToUI(result.config, true);
                showToast('✅ Informações da Barbearia salvas com sucesso!', 'success');
            } else {
                showToast(result.error || 'Erro ao salvar informações.', 'error');
            }
        } catch (err) {
            showToast('Erro de conexão ao salvar informações.', 'error');
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = originalBtnHtml;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ------------------------------------------------------------------
    // Bot Management (Restart / Logout)
    // ------------------------------------------------------------------
    elements.btnRestartBot.addEventListener('click', async () => {
        if (!confirm('Deseja reiniciar o bot do WhatsApp?')) return;
        showToast('Reiniciando conexão...', 'info');
        await fetch('/api/bot/restart', { method: 'POST' });
    });

    elements.btnLogoutBot.addEventListener('click', async () => {
        if (!confirm('Deseja desconectar a sessão do WhatsApp? Será necessário ler o QR code novamente.')) return;
        showToast('Desconectando WhatsApp...', 'info');
        await fetch('/api/bot/logout', { method: 'POST' });
    });

    elements.btnManualRefreshQr.addEventListener('click', async () => {
        showToast('🔄 Verificando QR Code atualizado...', 'info');
        try {
            await fetchStatus();
            if (state.botStatus === 'QR_READY' || state.botStatus === 'INITIALIZING') {
                elements.qrImage.src = `/api/qr.png?t=${Date.now()}`;
            }
        } catch (e) {
            console.error("Erro ao atualizar QR Code:", e);
        }
    });

    elements.btnRefreshAll.addEventListener('click', () => {
        refreshData(true);
        showToast('Dados atualizados!', 'info');
    });

    // ------------------------------------------------------------------
    // Global Refresh & Initial Load
    // ------------------------------------------------------------------
    async function refreshData(forceConfig = false) {
        await Promise.all([
            fetchStatus(),
            fetchConfig(forceConfig),
            loadDaysList(),
            loadSlotsForDate(state.selectedDate),
            loadAppointments()
        ]);
    }

    async function fetchStatus() {
        try {
            const res = await fetch('/api/status?t=' + Date.now(), { cache: 'no-store' });
            const data = await res.json();
            updateBotStatusUI(data);
            if (data.stats) updateStatsUI(data.stats);
        } catch (e) {
            console.error("Erro ao obter status do bot:", e);
        }
    }

    async function fetchConfig(force = false) {
        try {
            const resCfg = await fetch('/api/config?t=' + Date.now(), { cache: 'no-store' });
            const cfg = await resCfg.json();
            state.config = cfg;
            applyConfigToUI(cfg, force);
        } catch (e) {
            console.error("Erro ao carregar configurações:", e);
        }
    }

    // ------------------------------------------------------------------
    // Auto-Sync Polling Loop (Garante sincronização de status sem resetar formulários)
    // ------------------------------------------------------------------
    setInterval(() => {
        const isWaiting = (state.botStatus === 'INITIALIZING' || 
                           state.botStatus === 'QR_READY' || 
                           state.botStatus === 'DISCONNECTED' ||
                           elements.qrImage.classList.contains('hidden'));
        
        if (isWaiting) {
            fetchStatus();
        }
    }, 1500);

    // Polling regular para estatísticas e agendamentos (a cada 8 segundos)
    setInterval(() => {
        if (state.botStatus === 'READY' || state.botStatus === 'AUTHENTICATED') {
            fetchStatus();
            if (state.currentTab === 'tab-calendar') {
                loadSlotsForDate(state.selectedDate);
            } else if (state.currentTab === 'tab-appointments') {
                loadAppointments();
            }
        }
    }, 8000);

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Inicialização imediata (com force = true para preencher os formulários na abertura)
    refreshData(true);
});
