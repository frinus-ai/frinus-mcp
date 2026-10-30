@echo off
title Frinus - Corrigir atalho
echo Atualizando o Frinus: atalho com a logo e assistente sem pedidos de permissao...
set FRINUS_SO_ATALHO=1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor 3072; iex (irm 'https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v12/install/setup.ps1' -UseBasicParsing)"
if errorlevel 1 pause
