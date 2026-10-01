@echo off
title Barbearia Bot & Painel Web de Agendamentos
chcp 65001 > nul
color 0E

echo =====================================================================
echo       💈 INICIANDO BARBEARIA BOT & PAINEL DE AGENDAMENTOS 💈
echo =====================================================================
echo.
echo [1/3] Acessando pasta do projeto...
cd /d "%~dp0"

echo [2/3] Abrindo o Painel de Controle no seu navegador...
start "" "http://localhost:3000"

echo [3/3] Iniciando o servidor e WhatsApp Web...
echo.
echo =====================================================================
echo   STATUS: Painel online em http://localhost:3000
echo   DICA: Deixe esta janela aberta enquanto a barbearia estiver aberta!
echo =====================================================================
echo.

node chatbot.js

echo.
echo O bot foi encerrado.
pause
