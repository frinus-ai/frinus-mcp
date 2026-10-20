@echo off
title Frinus - Instalador
echo Iniciando o instalador do Frinus. Quando o Windows perguntar, clique em "Sim".
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor 3072; iex (irm 'https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v5/install/setup.ps1' -UseBasicParsing)"
if errorlevel 1 pause
