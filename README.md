# 💈 Barbearia Bot & Painel Web de Agendamentos

Sistema profissional de agendamento automático para salão e barbearia via **WhatsApp**, com **Dashboard Web em Tempo Real**, **Transmissão ao Vivo de QR Code via WebSocket**, e **Prevenção Ativa Anti-Conflito de Horários**.

---

## 🚀 Como Executar

1. Inicie o servidor:
```bash
npm start
```
2. Abra o navegador no painel web:
👉 **[http://localhost:3000](http://localhost:3000)**

3. No painel, o **QR Code** aparecerá automaticamente na tela. Basta escanear pelo WhatsApp do celular (*Aparelhos Conectados > Conectar um Aparelho*).

---

## 🛡️ Lógica Anti-Conflito (Zero Colisão de Horários)

- Quando um cliente agenda um horário (ex: **Segunda-feira às 10:00**), o horário é imediatamente registrado no banco de dados.
- O sistema **remove automaticamente** esse horário da listagem enviada a qualquer outro cliente.
- Caso dois clientes tentem confirmar exatamente o mesmo horário simultaneamente, uma **verificação atômica** em tempo real impede a segunda reserva, alertando o usuário e oferecendo apenas as opções vagas restantes.
- Ao cancelar um agendamento (seja pelo WhatsApp ou pelo Painel Web), a vaga é liberada instantaneamente.

---

## ✨ Funcionalidades

- **📱 Hub de Conexão WhatsApp com QR Code ao Vivo**:
  - Exibição de QR Code em tempo real no frontend via Socket.io com animação de scanner.
  - Indicador de status de conexão (*Aguardando*, *Autenticado*, *Online*).
  - Informações do perfil conectado, número e opções de desconectar/reiniciar sessão.
- **📅 Agenda & Calendário Interativo**:
  - Matriz visual de horários do dia (09:00 às 21:00) destacando vagas livres e agendamentos.
  - Navegação entre os dias da semana (Segunda a Sábado) com contador de vagas livres.
  - Criação manual de agendamentos para clientes de balcão.
- **📋 Gestão Completa de Agendamentos**:
  - Tabela com filtros por data, status (*Confirmado*, *Concluído*, *Cancelado*) e busca por cliente/telefone.
- **💬 Simulador WhatsApp & Logs ao Vivo**:
  - Teste interativo do fluxo do bot diretamente no navegador sem precisar gastar mensagens de teste.
  - Console em tempo real de mensagens recebidas e enviadas.
- **⚙️ Configurações & Serviços Customizáveis**:
  - Edição do nome da barbearia, chave PIX, endereço e WhatsApp do dono (que recebe notificações automáticas).
  - Tabela de serviços e valores configurável.
