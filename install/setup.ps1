# =============================================================================
# Frinus — Preparacao no Windows (para clientes)
# =============================================================================
# Este e o unico arquivo que o cliente Windows executa. Ele:
#   1. Garante que o "Ubuntu" (WSL2) esteja instalado — se nao, instala e pede
#      para reiniciar o computador (corte natural do processo).
#   2. Depois que o Ubuntu esta pronto, chama o instalador de verdade la dentro,
#      onde a memoria do Frinus funciona de forma confiavel.
#
# No Windows nativo a conexao de memoria nao e confiavel; por isso levamos o
# cliente para dentro do Ubuntu (WSL2), onde tudo funciona como no Linux.
#
# Marca: RDX  |  Produto: Frinus
# =============================================================================

$ErrorActionPreference = 'Stop'

# O 'wsl.exe' escreve a saida em UTF-16 por padrao, e o PowerShell do Windows
# le isso como texto com bytes nulos entre as letras ("U\0b\0u\0n..."), o que
# faz a comparacao de nomes falhar mesmo com o Ubuntu instalado. Esta variavel
# pede saida em UTF-8 (WSL 0.64+); o filtro de nulos abaixo cobre versoes antigas.
$env:WSL_UTF8 = 1

# Endereco de onde o instalador do Ubuntu e baixado (HTTPS).
# >>> A equipe RDX define este endereco antes de distribuir. <<<
$InstallUrl = if ($env:FRINUS_INSTALL_URL) { $env:FRINUS_INSTALL_URL } else { 'https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v2/install/install.sh' }
$Distro     = 'Ubuntu'
$Suporte    = 'Se precisar de ajuda, chame a equipe RDX que te enviou este instalador.'

function Titulo($t) { Write-Host ""; Write-Host $t -ForegroundColor Magenta }
function Passo($t)  { Write-Host "> $t" }
function Ok($t)     { Write-Host "OK: $t" -ForegroundColor Green }
function Aviso($t)  { Write-Host "!  $t" -ForegroundColor Yellow }
function Parar($msg, $acao) {
  Write-Host ""
  Write-Host "X $msg" -ForegroundColor Red
  if ($acao) { Write-Host "  $acao" }
  Write-Host ""
  Write-Host "  $Suporte"
  Write-Host ""
  exit 1
}

Titulo "Frinus — vamos preparar o seu computador"
Write-Host "Isto prepara a base para o seu assistente com memoria. Simples e guiado." -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Precisa de permissao de administrador para instalar o Ubuntu (WSL2).
# ---------------------------------------------------------------------------
$souAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# ---------------------------------------------------------------------------
# 1) O Ubuntu (WSL2) ja esta instalado?
# ---------------------------------------------------------------------------
Titulo "1) Verificando a base do sistema"

$temWsl = $false
try { Get-Command wsl.exe -ErrorAction Stop | Out-Null; $temWsl = $true } catch { $temWsl = $false }

$temDistro = $false
if ($temWsl) {
  # 'wsl -l -q' lista as distribuicoes instaladas (uma por linha).
  try {
    $lista = @( (wsl.exe -l -q) 2>$null |
                ForEach-Object { ($_ -replace "`0", '').Trim() } |
                Where-Object { $_ -ne '' } )
    if ($lista -contains $Distro) { $temDistro = $true }
    elseif ($lista.Count -gt 0)  { $temDistro = $true; $Distro = $lista[0] }  # usa a distro que ja existe
  } catch { $temDistro = $false }
}

if (-not $temDistro) {
  Passo "Vou instalar a base (Ubuntu). Isso precisa de permissao de administrador."
  if (-not $souAdmin) {
    Parar "Preciso ser executado como administrador para instalar a base." `
          "Feche esta janela. Clique com o botao direito no 'PowerShell' e escolha 'Executar como administrador'. Depois cole o mesmo comando de novo."
  }
  # Programa externo que falha NAO gera erro terminante no PowerShell (o
  # $ErrorActionPreference so vale para cmdlets), entao o try/catch sozinho
  # deixaria a falha passar em silencio. Conferimos o codigo de saida.
  $falhou = $false
  try {
    wsl.exe --install -d $Distro
    if ($LASTEXITCODE -ne 0) { $falhou = $true }
  } catch {
    $falhou = $true
  }
  if ($falhou) {
    Parar "Nao consegui instalar a base automaticamente." `
          "Verifique sua conexao com a internet e tente de novo. Se continuar, chame a equipe RDX."
  }

  Titulo "Quase la — precisamos reiniciar o computador"
  Write-Host ""
  Write-Host "A base foi instalada. Agora:" -ForegroundColor White
  Write-Host "  1. Reinicie o computador."
  Write-Host "  2. Ao voltar, uma janela do 'Ubuntu' vai abrir e pedir para voce"
  Write-Host "     criar um nome de usuario e uma senha. Escolha e ANOTE a senha."
  Write-Host "  3. Depois disso, cole novamente o mesmo comando que a RDX te enviou"
  Write-Host "     para concluir a instalacao do assistente."
  Write-Host ""
  Ok "Pode reiniciar quando quiser."
  exit 0
}

Ok "Base do sistema (Ubuntu) pronta."

# ---------------------------------------------------------------------------
# 2) Rodar o instalador do assistente DENTRO do Ubuntu
# ---------------------------------------------------------------------------
Titulo "2) Instalando o assistente com memoria"
Write-Host "A partir daqui a instalacao continua dentro do Ubuntu." -ForegroundColor DarkGray
Write-Host "Em algum momento ela vai pedir a sua chave de acesso e o login da sua conta Claude." -ForegroundColor DarkGray

# Baixa o instalador para dentro do Ubuntu e executa mantendo o teclado ligado
# (para conseguir pedir a chave e fazer o login de forma interativa).
# Nao passamos a chave por aqui de proposito: ela e digitada dentro do Ubuntu,
# escondida, sem passar pelo Windows.
$cmd = "curl -fsSL '$InstallUrl' -o /tmp/frinus-install.sh && bash /tmp/frinus-install.sh"

# Mesma armadilha do passo anterior: se o instalador de dentro do Ubuntu sair
# com erro, o catch nao dispara. O codigo de saida e a unica evidencia real.
$falhouInstall = $false
try {
  wsl.exe -d $Distro -- bash -lic $cmd
  if ($LASTEXITCODE -ne 0) { $falhouInstall = $true }
} catch {
  $falhouInstall = $true
}
if ($falhouInstall) {
  Parar "A instalacao dentro do Ubuntu nao foi concluida." `
        "Abra o 'Ubuntu' pelo menu Iniciar e cole novamente o mesmo comando que a RDX te enviou."
}

Write-Host ""
Ok "Instalacao concluida."
Write-Host ""
Write-Host "Para usar: abra o 'Ubuntu' pelo menu Iniciar, digite 'claude' e pressione ENTER." -ForegroundColor White
Write-Host ""
Write-Host "Uma solucao RDX." -ForegroundColor DarkGray
