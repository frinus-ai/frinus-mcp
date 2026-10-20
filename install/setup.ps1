# =============================================================================
# Frinus - Instalador para Windows (para clientes)
# =============================================================================
# Este e o unico arquivo que roda no Windows. De ponta a ponta, sozinho:
#   1. Pede permissao de administrador (o Windows mostra "Sim/Nao").
#   2. Pede a chave do Frinus e confere na hora se ela e valida.
#   3. Instala a base (Ubuntu / WSL2). Se o Windows exigir, reinicia o
#      computador sozinho e CONTINUA a instalacao depois do login.
#   4. Pede um nome de usuario e uma senha para o Ubuntu e cria a conta.
#   5. Instala o assistente com memoria dentro do Ubuntu e testa de verdade.
#   6. Cria o atalho "Frinus" na area de trabalho.
#
# A pessoa so digita: a chave do Frinus, o usuario e a senha do Ubuntu.
# O login na conta Claude acontece na primeira vez que o assistente e aberto.
#
# No Windows nativo a conexao de memoria nao e confiavel; por isso o assistente
# roda dentro do Ubuntu (WSL2), onde tudo funciona como no Linux.
#
# Marca: RDX  |  Produto: Frinus
# =============================================================================
param([switch]$Retomada)

$ErrorActionPreference = 'Stop'

# PowerShell 5.1 em Windows antigo nao liga TLS 1.2 sozinho (GitHub exige).
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# O wsl.exe escreve em UTF-16 por padrao; isto pede UTF-8 (WSL 0.64+). O filtro
# de bytes nulos em Obter-Distro cobre versoes antigas.
$env:WSL_UTF8 = 1

# Versao publicada. Ao lancar uma nova tag, troque SO esta linha (e o README).
$Tag        = 'client-installer-v4'
$Base       = "https://raw.githubusercontent.com/frinus-ai/frinus-mcp/$Tag/install"
$SelfUrl    = if ($env:FRINUS_SETUP_URL)   { $env:FRINUS_SETUP_URL }   else { "$Base/setup.ps1" }
$InstallUrl = if ($env:FRINUS_INSTALL_URL) { $env:FRINUS_INSTALL_URL } else { "$Base/install.sh" }
$CpUrl      = 'https://frinus-api.rdxsec.com.br'
$Distro     = 'Ubuntu'
$Suporte    = 'Se precisar de ajuda, chame a equipe RDX que te enviou este instalador.'

$Pasta      = Join-Path $env:LOCALAPPDATA 'Frinus'
$CopiaLocal = Join-Path $Pasta 'setup.ps1'
$ArqChave   = Join-Path $Pasta 'chave.dat'        # protegida pelo Windows (DPAPI, so este usuario le)
$ArqReinicio= Join-Path $Pasta 'reinicios.txt'
$Tarefa     = 'Frinus - concluir instalacao'
$MaxReinicios = 2

# ---------------------------------------------------------------------------
# Mensagens
# ---------------------------------------------------------------------------
function Titulo($t) { Write-Host ""; Write-Host $t -ForegroundColor Magenta }
function Passo($t)  { Write-Host "> $t" }
function Ok($t)     { Write-Host "OK: $t" -ForegroundColor Green }
function Pulou($t)  { Write-Host "-  $t" -ForegroundColor DarkGray }
function Aviso($t)  { Write-Host "!  $t" -ForegroundColor Yellow }
function Pausar     { Write-Host ""; try { Read-Host "Pressione ENTER para fechar esta janela" | Out-Null } catch {} }
function Parar($msg, $acao) {
  Write-Host ""
  Write-Host "X $msg" -ForegroundColor Red
  if ($acao) { Write-Host "  $acao" }
  Write-Host ""
  Write-Host "  $Suporte"
  Remover-Retomada
  Pausar
  exit 1
}

# ---------------------------------------------------------------------------
# Ajudantes do Windows (isolados em funcoes para poderem ser testados)
# ---------------------------------------------------------------------------
function Sou-Admin {
  ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Meu-Usuario { [Security.Principal.WindowsIdentity]::GetCurrent().Name }

function Texto($seguro) {
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

function Gravar-Utf8($caminho, $conteudo, [bool]$bom) {
  [IO.File]::WriteAllText($caminho, $conteudo, (New-Object Text.UTF8Encoding $bom))
}

# Copia local deste instalador: e ela que o Windows executa depois de reiniciar.
# Com BOM porque o PowerShell 5.1 le arquivo sem BOM como ANSI.
function Garantir-CopiaLocal {
  New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
  if ($PSCommandPath -and ((Resolve-Path $PSCommandPath).Path -eq $CopiaLocal)) { return }
  if ($PSCommandPath) { $txt = [IO.File]::ReadAllText($PSCommandPath) }
  else {
    try { $txt = Invoke-RestMethod -Uri $SelfUrl -UseBasicParsing -TimeoutSec 60 }
    catch { Parar "Nao consegui baixar o instalador." "Verifique sua conexao com a internet e tente de novo." }
  }
  Gravar-Utf8 $CopiaLocal $txt $true
}

function Pedir-Elevacao {
  Passo "O Windows vai perguntar se permite alteracoes. Clique em 'Sim'."
  try {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$CopiaLocal`"")
  } catch {
    Parar "A permissao de administrador nao foi concedida." "Rode o instalador de novo e clique em 'Sim' quando o Windows perguntar."
  }
}

function Guardar-Chave($k) {
  ConvertTo-SecureString $k -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $ArqChave
}
function Ler-Chave {
  if (-not (Test-Path $ArqChave)) { return $null }
  try { return (Texto (Get-Content -Path $ArqChave | ConvertTo-SecureString)) } catch { return $null }
}
function Apagar-Chave { Remove-Item -Force -ErrorAction SilentlyContinue $ArqChave }

# 'ok' | 'recusada' | 'indefinido'  (+ nome da empresa quando ok)
function Testar-Chave($k) {
  try {
    $r = Invoke-RestMethod -Uri "$CpUrl/api/v1/templates/mcp-config" -Headers @{ 'X-API-Key' = $k } -UseBasicParsing -TimeoutSec 30
    $nome = ''
    try { $nome = $r.organization.name } catch {}
    return @{ estado = 'ok'; empresa = $nome }
  } catch {
    $codigo = 0
    try { $codigo = [int]$_.Exception.Response.StatusCode } catch {}
    if ($codigo -eq 401) { return @{ estado = 'recusada' } }
    # 403 pode ser o filtro de rede do provedor, nao a chave: o teste definitivo
    # e refeito dentro do Ubuntu. Sem internet tambem cai aqui.
    return @{ estado = 'indefinido' }
  }
}

function Registrar-Retomada {
  $eu = Meu-Usuario
  $acao    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$CopiaLocal`" -Retomada"
  $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $eu
  $quem    = New-ScheduledTaskPrincipal -UserId $eu -LogonType Interactive -RunLevel Highest
  $ajuste  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho -Principal $quem -Settings $ajuste -Force | Out-Null
}
function Remover-Retomada {
  try { Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}
}
function Reiniciar-Computador {
  & shutdown.exe /r /t 60 /c "Frinus: o computador vai reiniciar em 1 minuto para concluir a instalacao. Salve seus arquivos." | Out-Null
}

function Criar-Atalho {
  try {
    $wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
    $sh  = New-Object -ComObject WScript.Shell
    $lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Frinus.lnk'))
    $lnk.TargetPath       = $wsl
    $lnk.Arguments        = "-d $Distro --cd ~ -- bash -lic claude"
    $lnk.WorkingDirectory = $env:USERPROFILE
    $lnk.IconLocation     = "$wsl,0"
    $lnk.Description      = 'Frinus - assistente com memoria'
    $lnk.Save()
    return $true
  } catch { return $false }
}

function Esperar-Internet {
  for ($i = 0; $i -lt 24; $i++) {
    try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com' -Method Head -UseBasicParsing -TimeoutSec 10 | Out-Null; return } catch {}
    try { Invoke-WebRequest -Uri $CpUrl -Method Head -UseBasicParsing -TimeoutSec 10 | Out-Null; return } catch {}
    Start-Sleep -Seconds 5
  }
}

# ---------------------------------------------------------------------------
# Ajudantes do Ubuntu (WSL)
# ---------------------------------------------------------------------------
# Nome da distro instalada ou $null.
# Em Windows com wsl.exe mas SEM distro, 'wsl -l -q' sai com codigo != 0 e
# imprime ajuda no STDOUT; as duas guardas impedem que essa frase vire "nome".
function Obter-Distro {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { return $null }
  try {
    $saida = @( (wsl.exe -l -q) 2>$null |
                ForEach-Object { ($_ -replace "`0", '').Trim() } |
                Where-Object { $_ -ne '' } )
    if ($LASTEXITCODE -ne 0) { $saida = @() }
    $lista = @( $saida | Where-Object { $_ -notmatch '\s' -and $_.Length -le 64 } )
    if ($lista -contains $Distro) { return $Distro }
    if ($lista.Count -gt 0) { return $lista[0] }
  } catch {}
  return $null
}

# Roda um script bash como root dentro do Ubuntu. O script vai por ARQUIVO
# (nunca pela linha de comando): o PowerShell 5.1 corrompe aspas em argumentos
# de programas externos. Segredos vao por variavel de ambiente (WSLENV).
function Rodar-ComoRoot($nomeDistro, $bash) {
  $dir = Join-Path $env:ProgramData 'Frinus'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $arq = Join-Path $dir ("passo-" + [guid]::NewGuid().ToString('N') + '.sh')
  Gravar-Utf8 $arq ($bash -replace "`r", '') $false
  try {
    $linux = (wsl.exe -d $nomeDistro -u root -- wslpath -a ($arq -replace '\\', '/')) 2>$null
    $linux = ("$linux" -replace "`0", '').Trim()
    if (-not $linux) { $linux = '/mnt/' + $arq.Substring(0,1).ToLower() + ($arq.Substring(2) -replace '\\', '/') }
    wsl.exe -d $nomeDistro -u root -- bash $linux
    return $LASTEXITCODE
  } finally { Remove-Item -Force -ErrorAction SilentlyContinue $arq }
}

function Testar-Base($nomeDistro) {
  $out = (wsl.exe -d $nomeDistro -u root -- echo pronto) 2>&1 | Out-String
  return @{ ok = ($LASTEXITCODE -eq 0 -and $out -match 'pronto'); saida = $out }
}

function Mensagem-Virtualizacao($texto) {
  if ("$texto" -match '0x80370102|HCS_E_HYPERV|virtualiz|BIOS') {
    Parar "A virtualizacao deste computador esta desligada." `
          "E preciso ligar a 'Virtualizacao' (Intel VT-x / AMD-V / SVM) na BIOS do computador. Peca ajuda ao suporte de TI e depois rode o instalador de novo."
  }
}

# ===========================================================================
# ==== INICIO ====
# ===========================================================================
Titulo "Frinus - vamos preparar o seu computador"
if ($Retomada) { Write-Host "Continuando a instalacao depois do reinicio..." -ForegroundColor DarkGray }
else { Write-Host "Voce so vai digitar a sua chave do Frinus e criar um usuario e uma senha. O resto e automatico." -ForegroundColor DarkGray }

Garantir-CopiaLocal

# ---------------------------------------------------------------------------
# 0) Permissao de administrador (pede sozinho; a pessoa so clica em "Sim")
# ---------------------------------------------------------------------------
if (-not (Sou-Admin)) {
  Pedir-Elevacao
  exit 0
}

if ($Retomada) { Esperar-Internet }
else {
  # Execucao iniciada por uma pessoa (ex.: depois de o TI ligar a virtualizacao):
  # recomeca a contagem de reinicios automaticos.
  Remove-Item -Force -ErrorAction SilentlyContinue $ArqReinicio
}

# ---------------------------------------------------------------------------
# 1) Chave do Frinus (pedida uma vez; sobrevive ao reinicio, protegida)
# ---------------------------------------------------------------------------
Titulo "1) Sua chave do Frinus"
$Chave = Ler-Chave
if ($Chave) {
  Pulou "Chave ja informada antes do reinicio - usando a mesma."
} else {
  for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
    Write-Host "Cole a chave que a equipe RDX te enviou (comeca com sk-frinus-) e aperte ENTER." -ForegroundColor DarkGray
    Write-Host "Ela aparece como asteriscos (*) - e normal, e por seguranca." -ForegroundColor DarkGray
    $k = (Texto (Read-Host -AsSecureString "Chave")) -replace '\s', ''
    if ($k -notlike 'sk-frinus-*') { Aviso "Essa nao parece uma chave do Frinus (deve comecar com sk-frinus-). Tente de novo."; continue }
    $teste = Testar-Chave $k
    if ($teste.estado -eq 'recusada') { Aviso "Essa chave nao foi reconhecida pelo Frinus. Confira se copiou a chave inteira."; continue }
    if ($teste.estado -eq 'ok' -and $teste.empresa) { Ok "Chave valida - conta: $($teste.empresa)" }
    else { Ok "Chave recebida (sera conferida de novo no final)." }
    $Chave = $k
    break
  }
  if (-not $Chave) { Parar "Nao recebi uma chave valida." "Peca a chave correta a equipe RDX e rode o instalador de novo." }
  Guardar-Chave $Chave
}

# ---------------------------------------------------------------------------
# 2) Base do sistema (Ubuntu / WSL2), reiniciando sozinho se preciso
# ---------------------------------------------------------------------------
Titulo "2) Preparando a base do sistema (Ubuntu)"
$nome = Obter-Distro
$saida = @()
if ($nome) {
  Pulou "Ubuntu ja instalado - pulando."
} else {
  if ($Retomada) {
    Passo "Atualizando o componente do Windows que roda o Ubuntu..."
    wsl.exe --update 2>&1 | Out-Host
  }
  Passo "Instalando o Ubuntu. Pode levar alguns minutos..."
  wsl.exe --install -d $Distro --no-launch 2>&1 | Tee-Object -Variable saida | Out-Host
  if ($LASTEXITCODE -ne 0 -and ("$saida" -match 'no-launch')) {
    # wsl.exe antigo (Windows 10 sem atualizacao) nao conhece --no-launch.
    wsl.exe --install -d $Distro 2>&1 | Tee-Object -Variable saida | Out-Host
  }
  $nome = Obter-Distro
}

# A base so conta como pronta se o Ubuntu de fato INICIA. Logo apos instalar,
# o Windows normalmente ainda precisa reiniciar para ligar o recurso.
if ($nome) { $base = Testar-Base $nome } else { $base = @{ ok = $false; saida = '' } }
if (-not $base.ok) {
  $feitos = 0
  if (Test-Path $ArqReinicio) { try { $feitos = [int](Get-Content $ArqReinicio | Select-Object -First 1) } catch { $feitos = 0 } }
  if ($feitos -ge $MaxReinicios) {
    Apagar-Chave
    Mensagem-Virtualizacao ("$($base.saida) $saida")
    Parar "O Ubuntu nao ficou disponivel mesmo depois de reiniciar." `
          "Confira se a 'Virtualizacao' esta ligada na BIOS e se o Windows esta atualizado (Windows Update). Depois rode o instalador de novo."
  }
  Set-Content -Path $ArqReinicio -Value ($feitos + 1)
  Registrar-Retomada
  Titulo "Falta pouco - o computador vai reiniciar sozinho"
  Write-Host "  Em 1 minuto o Windows reinicia. Salve o que estiver aberto." -ForegroundColor White
  Write-Host "  Quando voce entrar no Windows de novo, a instalacao CONTINUA SOZINHA." -ForegroundColor White
  Reiniciar-Computador
  Write-Host ""
  try { Read-Host "Pressione ENTER para reiniciar agora (ou aguarde)" | Out-Null; & shutdown.exe /a 2>$null | Out-Null; & shutdown.exe /r /t 0 | Out-Null } catch {}
  exit 0
}
$Distro = $nome
Remover-Retomada
Remove-Item -Force -ErrorAction SilentlyContinue $ArqReinicio
Ok "Base do sistema (Ubuntu) pronta."

# ---------------------------------------------------------------------------
# 3) Usuario e senha do Ubuntu (criados aqui, sem depender da tela do Ubuntu)
# ---------------------------------------------------------------------------
Titulo "3) Seu usuario do Ubuntu"
# Ja existe conta "de verdade" (uid 1000 COM senha)? Entao nao mexemos nela.
# Algumas imagens do Ubuntu trazem um usuario "ubuntu" uid 1000 SEM senha:
# nesse caso ele e renomeado para o nome escolhido e recebe a senha digitada.
$linha = ((wsl.exe -d $Distro -u root -- getent passwd 1000) 2>$null | Out-String) -replace "`0", ''
$Usuario = $null
if ($LASTEXITCODE -eq 0 -and $linha.Trim()) {
  $existente = $linha.Trim().Split(':')[0]
  $status = ((wsl.exe -d $Distro -u root -- passwd -S $existente) 2>$null | Out-String) -replace "`0", ''
  if (($status.Trim() -split '\s+')[1] -eq 'P') { $Usuario = $existente }
}

if ($Usuario) {
  Pulou "Usuario do Ubuntu ja existe ($Usuario) - pulando."
} else {
  while (-not $Usuario) {
    $u = (Read-Host "Escolha um nome de usuario (so letras minusculas e numeros, sem espaco. Ex.: maria)").Trim()
    if ($u -cnotmatch '^[a-z][a-z0-9_-]{0,31}$' -or @('root','admin','ubuntu','daemon','bin','sys','nobody') -contains $u) {
      Aviso "Use so letras minusculas e numeros, comecando por letra (ex.: maria, joao2)."; continue
    }
    $Usuario = $u
  }
  $Senha = $null
  while (-not $Senha) {
    Write-Host "Agora crie uma senha (aparece como asteriscos). ANOTE essa senha." -ForegroundColor DarkGray
    $s1 = Texto (Read-Host -AsSecureString "Senha")
    $s2 = Texto (Read-Host -AsSecureString "Repita a senha")
    if ($s1.Length -lt 4) { Aviso "A senha precisa ter pelo menos 4 caracteres."; continue }
    if ($s1 -cne $s2)     { Aviso "As duas senhas nao sao iguais. Vamos de novo."; continue }
    $Senha = $s1
  }

  $env:FRINUS_U = $Usuario
  $env:FRINUS_P = $Senha
  $env:WSLENV   = 'FRINUS_U/u:FRINUS_P/u'
  $criar = @'
set -eu
GRUPOS=""
for g in adm cdrom sudo dip plugdev users; do
  if getent group "$g" >/dev/null; then GRUPOS="${GRUPOS:+$GRUPOS,}$g"; fi
done
ANTIGO="$(getent passwd 1000 | cut -d: -f1 || true)"
if [ -n "$ANTIGO" ] && [ "$ANTIGO" != "$FRINUS_U" ]; then
  # uid 1000 de fabrica, sem senha: renomeia (mantem o uid 1000 que o WSL espera)
  usermod -l "$FRINUS_U" -d "/home/$FRINUS_U" -m "$ANTIGO"
  if getent group "$ANTIGO" >/dev/null; then groupmod -n "$FRINUS_U" "$ANTIGO"; fi
  usermod -s /bin/bash -aG "$GRUPOS" "$FRINUS_U"
elif [ -z "$ANTIGO" ]; then
  useradd -m -u 1000 -s /bin/bash -G "$GRUPOS" "$FRINUS_U"
fi
printf '%s:%s\n' "$FRINUS_U" "$FRINUS_P" | chpasswd
# Usuario padrao ao abrir o Ubuntu (preserva o resto do wsl.conf)
F=/etc/wsl.conf
touch "$F"
if grep -q '^\[user\]' "$F"; then
  sed -i '/^\[user\]/,/^\[/{/^default[[:space:]]*=/d}' "$F"
  sed -i "/^\[user\]/a default=$FRINUS_U" "$F"
else
  printf '\n[user]\ndefault=%s\n' "$FRINUS_U" >> "$F"
fi
'@
  $rc = Rodar-ComoRoot $Distro $criar
  Remove-Item Env:FRINUS_P -ErrorAction SilentlyContinue
  Remove-Item Env:FRINUS_U -ErrorAction SilentlyContinue
  $Senha = $null; $s1 = $null; $s2 = $null
  if ($rc -ne 0) { Parar "Nao consegui criar o usuario do Ubuntu." "Rode o instalador de novo. Se continuar, chame a equipe RDX." }
  wsl.exe --terminate $Distro 2>$null | Out-Null
  Ok "Usuario '$Usuario' criado."
}

# ---------------------------------------------------------------------------
# 4) Assistente com memoria, instalado DENTRO do Ubuntu
# ---------------------------------------------------------------------------
Titulo "4) Instalando o assistente com memoria"
Write-Host "Leva alguns minutos. Nao precisa fazer nada." -ForegroundColor DarkGray

# A chave vai por variavel de ambiente (WSLENV), nunca pela linha de comando.
# FRINUS_DEFER_LOGIN: o login da conta Claude fica para o primeiro uso.
$env:FRINUS_API_KEY     = $Chave
$env:FRINUS_DEFER_LOGIN = '1'
$env:WSLENV = 'FRINUS_API_KEY/u:FRINUS_DEFER_LOGIN/u'
$cmd = "curl -fsSL '$InstallUrl' -o /tmp/frinus-install.sh && bash /tmp/frinus-install.sh"

$falhouInstall = $false
try {
  wsl.exe -d $Distro -u $Usuario --cd '~' -- bash -lic $cmd
  if ($LASTEXITCODE -ne 0) { $falhouInstall = $true }
} catch { $falhouInstall = $true }
Remove-Item Env:FRINUS_API_KEY -ErrorAction SilentlyContinue
$Chave = $null

if ($falhouInstall) {
  Apagar-Chave
  Parar "A instalacao do assistente nao foi concluida." `
        "Rode o instalador de novo (ele aproveita o que ja foi feito). Se a mensagem acima falar da chave, peca uma chave nova a equipe RDX."
}
Apagar-Chave

# ---------------------------------------------------------------------------
# 5) Atalho na area de trabalho
# ---------------------------------------------------------------------------
if (Criar-Atalho) { Ok "Atalho 'Frinus' criado na area de trabalho." }
else { Aviso "Nao consegui criar o atalho. Para abrir: menu Iniciar > Ubuntu > digite claude." }

Titulo "Instalacao concluida!"
Write-Host ""
Write-Host "Para usar: clique duas vezes no atalho 'Frinus' na area de trabalho." -ForegroundColor White
Write-Host "Na PRIMEIRA vez ele pede para entrar na sua conta Claude (abre o navegador)." -ForegroundColor White
Write-Host "Depois disso e so conversar." -ForegroundColor White
Write-Host ""
Write-Host "Uma solucao RDX." -ForegroundColor DarkGray
Pausar
exit 0
