const db = require('./database');

// Formatador de data amigável (ex: 05/10/2026)
function formatarDataBR(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Extrai número de opção de forma tolerante (ex: "1", "1️⃣", "1.", "opcao 1", "opção 1")
function extrairNumeroOpcao(texto) {
    if (!texto) return null;
    const limpo = String(texto).trim();
    // Emoji numérico (1️⃣, 2️⃣, etc.)
    const matchEmoji = limpo.match(/^([1-9])\uFE0F?\u20E3/);
    if (matchEmoji) return parseInt(matchEmoji[1]);

    // Prefixo tipo "opcao 1", "opção 1", "#1", "1.", "1)"
    const matchNum = limpo.match(/^(?:opç[aã]o|opcao|n[uú]mero|num|#)?\s*([1-9][0-9]?)(?:[.)\s-]|$)/i);
    if (matchNum) return parseInt(matchNum[1]);

    const num = parseInt(limpo);
    return isNaN(num) ? null : num;
}

// Processador principal de mensagens do WhatsApp
async function processarMensagem({ from, nome, texto, sendMessage, sendTyping, emitEvent }) {
    const nomeCliente = (nome || 'Cliente').split(' ')[0];
    const mensagemLimpa = (texto || '').trim();
    const mensagemLower = mensagemLimpa.toLowerCase();
    const mensagemSemPontuacao = mensagemLower.replace(/[!?.,;]/g, '').trim();

    const config = db.getConfig();
    const estado = db.getEstadoConversa(from);

    const logEvento = (tipo, detalhe) => {
        if (emitEvent) {
            emitEvent('bot_log', {
                hora: new Date().toLocaleTimeString('pt-BR'),
                cliente: nome,
                telefone: from,
                tipo,
                detalhe
            });
        }
    };

    // Helper para enviar com digitação
    const responder = async (textoResposta) => {
        if (sendTyping) {
            try { await sendTyping(); } catch(e){}
        }
        await sendMessage(from, textoResposta);
        logEvento('saida', textoResposta);
    };

    // Helper para notificar o dono
    const notificarDono = async (mensagemNotificacao) => {
        if (config.numeroDono && sendMessage) {
            try {
                await sendMessage(config.numeroDono, mensagemNotificacao);
            } catch (err) {
                console.error("⚠️ Erro ao notificar dono via WhatsApp:", err.message);
            }
        }
    };

    logEvento('entrada', mensagemLimpa);

    // 1. Comandos Globais de Interrupção/Menu/Cancelamento/Saudações
    if (mensagemSemPontuacao === 'menu' || mensagemSemPontuacao === 'voltar' || 
        mensagemSemPontuacao === 'inicio' || mensagemSemPontuacao === 'início' ||
        mensagemSemPontuacao.match(/^(oi|olá|ola|bom dia|boa tarde|boa noite|opa|eai|eae|start|comecar|começar|oie|salve)$/i)) {
        db.limparEstadoConversa(from);
        return await enviarMenuPrincipal(responder, nomeCliente, config);
    }

    if (mensagemSemPontuacao === 'cancelar' || mensagemSemPontuacao === 'desmarcar') {
        return await processarFluxoCancelamento(responder, from, nomeCliente, null, emitEvent, notificarDono);
    }

    const numOpcao = extrairNumeroOpcao(mensagemLimpa);

    // 2. Se o cliente estiver sem estado ativo (idle)
    if (!estado || estado.status === 'idle' || !estado.status) {
        if (mensagemLower.match(/(agendar|corte|barba|horario|horário|agenda|salao|salão|barbearia|marcar)/i)) {
            return await iniciarFluxoAgendamento(responder, from, config);
        }

        // Se respondeu números diretos a partir do menu inicial
        if (numOpcao === 1) {
            return await iniciarFluxoAgendamento(responder, from, config);
        } else if (numOpcao === 2) {
            return await processarFluxoCancelamento(responder, from, nomeCliente, null, emitEvent, notificarDono);
        } else if (numOpcao === 3) {
            return await enviarListaServicos(responder, config);
        } else if (numOpcao === 4) {
            return await enviarInfoLocalizacao(responder, config);
        } else {
            // Qualquer outra mensagem, oferece o menu
            return await enviarMenuPrincipal(responder, nomeCliente, config);
        }
    }

    // 3. Máquina de Estados da Conversa
    switch (estado.status) {
        // ---- ETAPA 1: ESCOLHA DO SERVIÇO ----
        case 'waiting_service': {
            const numServico = extrairNumeroOpcao(mensagemLimpa);
            const servicoEscolhido = numServico ? config.servicos.find(s => s.id === numServico) : null;

            if (!servicoEscolhido) {
                return await responder(
                    `⚠️ Opção inválida! Por favor, digite o *número correspondente* ao serviço desejado (Ex: *1*):\n\n` +
                    formatarListaServicos(config.servicos) + `\n_Ou digite *MENU* para voltar._`
                );
            }

            // Salva serviço e avança para escolha do dia
            const diasDisponiveis = db.getProximosDiasDisponiveis();
            if (diasDisponiveis.length === 0) {
                db.limparEstadoConversa(from);
                return await responder(`😔 No momento não temos dias com horários disponíveis. Entre em contato diretamente conosco pelo número comercial!`);
            }

            db.setEstadoConversa(from, {
                status: 'waiting_day',
                servico: servicoEscolhido,
                diasDisponiveis: diasDisponiveis
            });

            let listaDiasTexto = diasDisponiveis.map((d, index) => {
                const vagasTxt = d.vagasDisponiveis > 0 ? `(${d.vagasDisponiveis} vagas livres)` : `(Esgotado)`;
                return `${index + 1}️⃣ *${d.rotulo}* ${vagasTxt}`;
            }).join('\n');

            return await responder(
                `✂️ Você escolheu: *${servicoEscolhido.nome}* (R$ ${servicoEscolhido.preco.toFixed(2)})\n\n` +
                `📅 *Agora escolha o dia do seu atendimento:*\n\n` +
                `${listaDiasTexto}\n\n` +
                `_Digite o número do dia (Ex: 1) ou *MENU* para voltar._`
            );
        }

        // ---- ETAPA 2: ESCOLHA DO DIA ----
        case 'waiting_day': {
            const numDia = extrairNumeroOpcao(mensagemLimpa);
            const indexDia = numDia !== null ? numDia - 1 : -1;
            const diasDisponiveis = estado.diasDisponiveis || db.getProximosDiasDisponiveis();

            if (indexDia < 0 || indexDia >= diasDisponiveis.length) {
                return await responder(`⚠️ Opção inválida. Digite o número correspondente ao dia desejado (de 1 a ${diasDisponiveis.length}) ou *MENU* para reiniciar.`);
            }

            const diaEscolhido = diasDisponiveis[indexDia];
            const horariosLivres = db.getHorariosDisponiveis(diaEscolhido.dataStr);

            if (horariosLivres.length === 0) {
                return await responder(
                    `😔 Poxa, os horários para *${diaEscolhido.rotulo}* acabaram de se esgotar!\n\n` +
                    `Por favor, digite outro dia da lista ou *MENU* para reiniciar.`
                );
            }

            // Salva dia e avança para escolha do horário
            db.setEstadoConversa(from, {
                status: 'waiting_hour',
                servico: estado.servico,
                diaEscolhido: diaEscolhido,
                horariosDisponiveis: horariosLivres
            });

            let listaHorariosTexto = horariosLivres.map((h, i) => `${i + 1}️⃣ ⏰ *${h}*`).join('\n');

            return await responder(
                `🗓️ Dia selecionado: *${diaEscolhido.rotulo}*\n\n` +
                `⏰ *Escolha um horário disponível para o seu corte:*\n\n` +
                `${listaHorariosTexto}\n\n` +
                `_Digite o número correspondente (Ex: 1) ou o horário (Ex: 10:00)._`
            );
        }

        // ---- ETAPA 3: ESCOLHA DO HORÁRIO E CONFIRMAÇÃO ANTI-COLISÃO ----
        case 'waiting_hour': {
            const diaEscolhido = estado.diaEscolhido;
            const servicoEscolhido = estado.servico;
            let horarioEscolhido = null;

            // Busca os horários livres mais atualizados no exato momento
            const horariosAtuais = db.getHorariosDisponiveis(diaEscolhido.dataStr);

            // Permite digitar "1" (índice) ou "10:00" diretamente
            const numIndex = extrairNumeroOpcao(mensagemLimpa);
            if (numIndex !== null && estado.horariosDisponiveis && estado.horariosDisponiveis[numIndex - 1]) {
                horarioEscolhido = estado.horariosDisponiveis[numIndex - 1];
            } else if (mensagemLimpa.includes(':') || mensagemLimpa.match(/^\d{1,2}h/i)) {
                // Se digitou algo como 10:00 ou 14:00 ou 14h
                const formatoHora = mensagemLimpa.replace(/h/i, ':').padStart(5, '0');
                if (horariosAtuais.includes(formatoHora)) {
                    horarioEscolhido = formatoHora;
                }
            }

            if (!horarioEscolhido) {
                let listaHorariosTexto = horariosAtuais.map((h, i) => `${i + 1}️⃣ ⏰ *${h}*`).join('\n');
                return await responder(
                    `⚠️ Horário não reconhecido ou já preenchido.\n\n` +
                    `Estes são os horários disponíveis no momento para *${diaEscolhido.rotulo}*:\n\n` +
                    `${listaHorariosTexto}\n\n` +
                    `_Por favor, digite o número da opção (Ex: 1)._`
                );
            }

            // 🛡️ CRITICAL LOCK & PERSISTENCE: Tenta criar o agendamento de forma atômica
            const resultado = db.criarAgendamento({
                cliente: nomeCliente,
                telefone: from,
                data: diaEscolhido.dataStr,
                horario: horarioEscolhido,
                servico: servicoEscolhido ? servicoEscolhido.nome : 'Corte de Cabelo',
                preco: servicoEscolhido ? servicoEscolhido.preco : 35,
                origem: 'whatsapp'
            });

            if (!resultado.success) {
                // CONFLITO DETECTADO! Outro cliente pegou a vaga no mesmo instante!
                const horariosRestantes = db.getHorariosDisponiveis(diaEscolhido.dataStr);
                if (horariosRestantes.length > 0) {
                    let listaRestante = horariosRestantes.map((h, i) => `${i + 1}️⃣ ⏰ *${h}*`).join('\n');
                    
                    db.setEstadoConversa(from, {
                        ...estado,
                        horariosDisponiveis: horariosRestantes
                    });

                    return await responder(
                        `⚠️ *Atenção:* O horário *${horarioEscolhido}* acabou de ser reservado por outro cliente!\n\n` +
                        `Para evitar duplicidades, escolha outro horário disponível:\n\n` +
                        `${listaRestante}\n\n` +
                        `_Digite o número do novo horário desejado._`
                    );
                } else {
                    db.limparEstadoConversa(from);
                    return await responder(
                        `😔 Que pena! Todos os horários para *${diaEscolhido.rotulo}* acabaram de ser preenchidos.\n\n` +
                        `Envie *MENU* para escolher outro dia ou entre em contato com nosso barbeiro.`
                    );
                }
            }

            // Agendamento realizado com sucesso!
            const ag = resultado.agendamento;
            db.limparEstadoConversa(from);

            // Emite evento para o painel frontend em tempo real
            if (emitEvent) {
                emitEvent('novo_agendamento', ag);
            }

            // Notifica o dono da barbearia
            await notificarDono(
                `📌 *NOVO AGENDAMENTO VIA WHATSAPP!*\n\n` +
                `👤 *Cliente:* ${ag.cliente}\n` +
                `📱 *Contato:* ${ag.telefone.replace('@c.us', '')}\n` +
                `✂️ *Serviço:* ${ag.servico} (R$ ${ag.preco.toFixed(2)})\n` +
                `📅 *Data:* ${formatarDataBR(ag.data)} (${diaEscolhido.nomeDia})\n` +
                `⏰ *Horário:* ${ag.horario}\n` +
                `🆔 *ID:* ${ag.id}`
            );

            // Mensagem de confirmação VIP para o cliente
            return await responder(
                `🎉 *AGENDAMENTO CONFIRMADO COM SUCESSO!* 🎉\n\n` +
                `💈 *${config.nomeSalao}*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 *Cliente:* ${ag.cliente}\n` +
                `✂️ *Serviço:* ${ag.servico}\n` +
                `📅 *Data:* ${formatarDataBR(ag.data)} (${diaEscolhido.nomeDia})\n` +
                `⏰ *Horário:* ${ag.horario}\n` +
                `💰 *Valor:* R$ ${ag.preco.toFixed(2)}\n` +
                `📍 *Local:* ${config.endereco}\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `💡 *Dica:* Chegue com 5 minutos de antecedência.\n` +
                `_Caso precise desmarcar, basta enviar *CANCELAR* aqui no chat._\n\n` +
                `Muito obrigado e até breve! 💈✨`
            );
        }

        // ---- ETAPA 4: CANCELAMENTO ESPECÍFICO ----
        case 'waiting_cancel_selection': {
            const ags = db.getAgendamentosCliente(from);
            const numIndex = extrairNumeroOpcao(mensagemLimpa);
            const index = numIndex !== null ? numIndex - 1 : -1;

            if (index < 0 || index >= ags.length) {
                return await responder(`⚠️ Opção inválida. Digite o número correspondente ao agendamento que deseja cancelar ou *MENU* para sair.`);
            }

            const agParaCancelar = ags[index];
            const cancelado = db.cancelarAgendamento(agParaCancelar.id, from);

            db.limparEstadoConversa(from);

            if (cancelado.success) {
                if (emitEvent) {
                    emitEvent('agendamento_cancelado', cancelado.agendamento);
                }

                await notificarDono(
                    `⚠️ *AGENDAMENTO CANCELADO PELO CLIENTE*\n\n` +
                    `👤 *Cliente:* ${agParaCancelar.cliente}\n` +
                    `📅 *Data:* ${formatarDataBR(agParaCancelar.data)}\n` +
                    `⏰ *Horário:* ${agParaCancelar.horario}\n` +
                    `✂️ *Serviço:* ${agParaCancelar.servico}\n\n` +
                    `_O horário está novamente livre no sistema!_`
                );

                return await responder(
                    `✅ Seu agendamento para *${formatarDataBR(agParaCancelar.data)} às ${agParaCancelar.horario}* foi cancelado com sucesso.\n\n` +
                    `O horário foi liberado. Quando desejar reagendar, basta enviar *MENU*!`
                );
            } else {
                return await responder(`⚠️ Não foi possível cancelar o agendamento. Pode já ter sido cancelado.`);
            }
        }

        default:
            db.limparEstadoConversa(from);
            return await enviarMenuPrincipal(responder, nomeCliente, config);
    }
}

// Helpers de Mensagens
async function enviarMenuPrincipal(responder, nomeCliente, config) {
    const fechadoHoje = db.isFechadoHoje();
    let avisoFechado = '';
    if (fechadoHoje) {
        avisoFechado = `\n🛑 *AVISO:* Hoje o salão está fechado para atendimentos (${config.motivoFechado || 'Recesso/Folga'}). Os agendamentos para os próximos dias continuam disponíveis!\n`;
    }

    return await responder(
        `💈 *BEM-VINDO À ${config.nomeSalao.toUpperCase()}* 💈\n\n` +
        `Olá, *${nomeCliente}*! Como podemos cuidar do seu visual hoje?\n` +
        avisoFechado + `\n` +
        `1️⃣ *Agendar Horário* 📅\n` +
        `2️⃣ *Ver Meus Agendamentos / Cancelar* 📋\n` +
        `3️⃣ *Tabela de Serviços & Preços* 💈\n` +
        `4️⃣ *Endereço & Horários de Funcionamento* 📍\n\n` +
        `👉 _Digite o número da opção desejada para continuar:_\n` +
        `_(Exemplo: envie *1* para agendar)_`
    );
}

function formatarListaServicos(servicos) {
    return servicos.map(s => `${s.id}️⃣ ${s.icone || '✂️'} *${s.nome}* — R$ ${s.preco.toFixed(2)} (${s.duracao})`).join('\n');
}

async function iniciarFluxoAgendamento(responder, from, config) {
    db.setEstadoConversa(from, { status: 'waiting_service' });
    const listaServicos = formatarListaServicos(config.servicos);

    return await responder(
        `💈 *ESCOLHA O SERVIÇO DESEJADO:* 💈\n\n` +
        `${listaServicos}\n\n` +
        `_Digite o número do serviço desejado (Ex: 1)_`
    );
}

async function processarFluxoCancelamento(responder, from, nomeCliente, _, emitEvent, notificarDono) {
    const ags = db.getAgendamentosCliente(from);

    if (ags.length === 0) {
        db.limparEstadoConversa(from);
        return await responder(
            `📋 Olá, *${nomeCliente}*!\n\n` +
            `Você não possui nenhum agendamento ativo no momento.\n\n` +
            `Deseja agendar um horário? Envie *1* para agendar!`
        );
    }

    if (ags.length === 1) {
        const ag = ags[0];
        const res = db.cancelarAgendamento(ag.id, from);
        db.limparEstadoConversa(from);

        if (res.success) {
            if (emitEvent) emitEvent('agendamento_cancelado', res.agendamento);
            await notificarDono(
                `⚠️ *AGENDAMENTO CANCELADO PELO CLIENTE*\n\n` +
                `👤 Cliente: ${ag.cliente}\n` +
                `📅 Data: ${formatarDataBR(ag.data)} às ${ag.horario}\n` +
                `✂️ Serviço: ${ag.servico}`
            );

            return await responder(
                `✅ Seu agendamento para *${formatarDataBR(ag.data)} às ${ag.horario}* (${ag.servico}) foi cancelado com sucesso!\n\n` +
                `O horário está livre novamente. Caso queira remarcar em outro horário, envie *MENU*.`
            );
        }
    }

    // Se tiver mais de um agendamento ativo
    db.setEstadoConversa(from, { status: 'waiting_cancel_selection' });
    let lista = ags.map((a, i) => `${i + 1}️⃣ 📅 *${formatarDataBR(a.data)} às ${a.horario}* - ${a.servico}`).join('\n');

    return await responder(
        `📋 *SEUS AGENDAMENTOS ATIVOS:*\n\n` +
        `${lista}\n\n` +
        `_Digite o número do agendamento que deseja cancelar (ou *MENU* para voltar):_`
    );
}

async function enviarListaServicos(responder, config) {
    const lista = formatarListaServicos(config.servicos);
    return await responder(
        `💈 *SERVIÇOS & VALORES — ${config.nomeSalao.toUpperCase()}* 💈\n\n` +
        `${lista}\n\n` +
        `💳 *Formas de Pagamento:* PIX, Cartão de Crédito/Débito e Dinheiro.\n` +
        `🔑 *Chave PIX:* \`${config.chavePix || 'Não informada'}\`\n\n` +
        `_Envie *1* para agendar seu horário agora mesmo!_`
    );
}

async function enviarInfoLocalizacao(responder, config) {
    const fechadoHoje = db.isFechadoHoje();
    let statusHoje = fechadoHoje 
        ? `🛑 *Hoje:* Fechado (${config.motivoFechado || 'Recesso'})`
        : `🟢 *Hoje:* Aberto normalmente`;

    return await responder(
        `📍 *LOCALIZAÇÃO & ATENDIMENTO* 💈\n\n` +
        `🏠 *Endereço:* ${config.endereco}\n` +
        `🕒 *Horário Base:* Segunda a Sábado das 09:00 às 21:00\n` +
        `📅 *Status Atual:* ${statusHoje}\n` +
        `📱 *WhatsApp do Barbeiro:* ${config.numeroDono ? config.numeroDono.replace('@c.us', '') : ''}\n\n` +
        `_Envie *1* para agendar ou *MENU* para ver as opções._`
    );
}

module.exports = {
    processarMensagem
};
