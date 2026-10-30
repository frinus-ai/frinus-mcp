# Frinus — instalador para cliente final (Windows / Linux / macOS)

Instalador de **um comando** para quem nunca abriu um terminal. Ao final: o
assistente Claude instalado, a memória Frinus conectada à conta do cliente, e uma
memória de teste gravada e lida de volta como prova. Todas as mensagens são em
PT-BR, sem termos técnicos.

## Arquivos

| Arquivo | Onde roda | Papel |
|--------|-----------|-------|
| [`Instalar-Frinus.cmd`](Instalar-Frinus.cmd) | Windows (duplo clique) | Atalho de 1 clique: só chama o `setup.ps1` da tag publicada. É o arquivo que se distribui (pendrive, pasta de rede, e-mail). |
| [`Corrigir-Atalho-Frinus.cmd`](Corrigir-Atalho-Frinus.cmd) | Windows (duplo clique) | Para máquina **já instalada**: substitui o atalho "Frinus" (logo) e atualiza o assistente no Ubuntu (sem pedidos de permissão). Sem chave, sem admin. Anexado à release `client-installer-v12`. |
| [`frinus.ico`](frinus.ico) | Windows | Ícone do atalho "Frinus" (gerado de `frontend/public/logo.svg`, 16–256 px). Se o download falhar, o atalho usa o ícone do WSL. |
| [`setup.ps1`](setup.ps1) | Windows (PowerShell) | Pede admin sozinho, pede a chave, instala o WSL2/Ubuntu, **reinicia e continua sozinho**, cria usuário/senha do Ubuntu, roda o instalador lá dentro e cria o atalho "Frinus" na área de trabalho. |
| [`install.sh`](install.sh) | Dentro do WSL2, ou Linux/macOS direto | Instala o que faltar, conecta a memória e valida com um teste real. |

No **Windows nativo** a conexão de memória não é confiável; por isso o caminho
oficial leva o cliente para dentro do WSL2, onde funciona como no Linux.

## One-liner (o que o cliente cola)

**Windows** — dê **duplo clique** em `Instalar-Frinus.cmd`. Ou, num PowerShell:

```powershell
irm https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v12/install/setup.ps1 | iex
```

Quem instala só faz isto:
1. clica em **Sim** quando o Windows pede permissão;
2. cola a **chave do Frinus** (conferida na hora; uma chave errada é recusada e pedida de novo);
3. espera o computador **reiniciar sozinho** (se o Windows exigir) e entra no Windows; a
   instalação **continua sozinha** depois do login;
4. digita o **usuário e a senha do Ubuntu** (a conta é criada pelo instalador);
5. no fim, aparece o atalho **Frinus** na área de trabalho.

O login na conta Claude fica para a **primeira vez que o atalho é aberto** (o Claude
pede sozinho). Isso é por design: o login é OAuth no navegador e não dá para automatizar.

Requisito de máquina: **virtualização ligada na BIOS** (Intel VT-x / AMD-V). Se estiver
desligada, o instalador para com uma mensagem clara; depois que o TI ligar, basta rodar
de novo.

**Linux / macOS** (ou dentro do Ubuntu, se preferir manual):

```bash
curl -fsSL https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v12/install/install.sh | bash
```

Os endereços apontam para a **tag imutável** `client-installer-v12` — ver
"Versionamento" abaixo.

## O que o cliente precisa ter em mãos

1. A **chave de acesso** (`sk-frinus-...`) — uma por cliente. O instalador pede a
   chave com digitação escondida (não aparece na tela, não fica no histórico).
2. Uma **conta Claude Pro ou Max** — o login é interativo e só o cliente pode fazer.

## Segurança — verificação opcional (SHA-256)

`curl | bash` / `irm | iex` baixam e executam código. A autenticidade em trânsito
é garantida pelo HTTPS do GitHub. Para quem quiser conferir o conteúdo **antes** de
executar, os hashes SHA-256 dos scripts desta release são:

```
install.sh            9529801440be47e76335213ed8888141e5f21bc80bb56ebc4c8ca07459ee524c
setup.ps1             ef9d2d1a05597f7aea8568616e53d50033b510bd99667fb10137c1ddde1754d4
Instalar-Frinus.cmd   a5206bb09519f6a3f98abc2509385c213e77bd50ed2fc8f937954ed079515153
Corrigir-Atalho-Frinus.cmd  7a4299b4294f533c906000aa50412ee107f61fdcb94e8349cb460f7a31a5e8b3
frinus.ico            d5ad20d853234a77df9d4e667e6eec53b0cd97933d2a937eaff7573d5effa8b6
```

Conferir no Linux/macOS antes de rodar:

```bash
curl -fsSL https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v12/install/install.sh -o install.sh
sha256sum install.sh   # deve bater com o hash acima
less install.sh        # revise, depois: bash install.sh
```

Conferir no Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v12/install/setup.ps1 -OutFile setup.ps1
Get-FileHash setup.ps1 -Algorithm SHA256   # compare com o hash acima
```

> Ao editar qualquer script, **recalcule e atualize os hashes acima** e publique
> uma nova tag (os hashes fazem parte da release).

## Garantias do instalador

- A chave é lida de forma **silenciosa** e passada ao registro da conexão por
  variável, nunca ecoada nem gravada em histórico de shell. A memória de teste é
  **apagada** ao final (não polui a base do cliente).
- Dentro do WSL/Linux o instalador **não usa `sudo`** — Node vai via `nvm` no
  `$HOME` e o Claude Code via `npm -g` no prefixo do nvm. No Windows, só o
  `wsl --install` exige administrador.
- **Idempotente**: rodar de novo detecta o que já existe, remove-e-recria a
  conexão, substitui só o bloco marcado do `CLAUDE.md` (preserva o que o cliente
  escreveu) e regenera os arquivos de agente. Nada duplica.
- **Descobre a empresa pela chave**: consulta `GET /api/v1/templates/mcp-config`
  (autenticado só pela chave) e monta as instruções de partida com o assistente
  principal correto da organização — nada é fixado no código.

## Novidades da v12

- **Atalho do Windows com a logo do Frinus, de verdade.** Até a v11 o ícone era
  *baixado* na hora de criar o atalho; se o download falhasse (proxy, antivírus,
  rede da empresa), o atalho caía em silêncio no ícone do WSL. Agora a logo vem
  **embutida no `setup.ps1`** (base64 do `frinus.ico` sem a camada de 128 px) e é
  gravada em `%LOCALAPPDATA%\Frinus\frinus-<hash>.ico` — o download virou só reserva.
- **Atalho conferido depois de salvo** (relê o `IconLocation`) e **log** de cada etapa
  em `%LOCALAPPDATA%\Frinus\atalho.log`.
- **`Corrigir-Atalho-Frinus.cmd`** (modo `FRINUS_SO_ATALHO=1`) para quem **já tem** o
  Frinus: acrescenta `--dangerously-skip-permissions` ao `~/.local/bin/frinus` de cada
  usuário do Ubuntu, grava `skipDangerousModePermissionPrompt` no `settings.json` e
  **substitui** o atalho pela versão com a logo. Idempotente; sem chave e sem admin.

## Novidades da v11

- **Assistente abre sem pedir permissão a cada ação.** O launcher `~/.local/bin/frinus`
  (usado pelo atalho do Windows, pelo atalho do Mac e pelo alias) agora roda
  `claude --agent frinus --dangerously-skip-permissions`. O instalador também grava
  `skipDangerousModePermissionPrompt: true` no `settings.json` do Claude
  (`$CLAUDE_CONFIG_DIR` ou `~/.claude`), para a 1ª abertura não parar na tela de
  aceite em inglês. Quem quiser o modo com confirmação roda `claude --agent frinus`.

## Novidades da v10

- **Passo 8 (teste de memória) nunca mais bloqueia.** Virou diagnóstico: a única
  etapa que barra a instalação é a validação da chave (passo 3). Conta de
  **Consulta** (consumer) que não grava recebe um aviso amigável, não um erro.
- **Comando/atalho sempre criados antes de qualquer etapa de rede.** O launcher
  `~/.local/bin/frinus`, o alias e o atalho (Mac/Windows) são criados logo após a
  chave ser validada. No Windows, o atalho é criado sempre que o launcher existir
  no Ubuntu — mesmo que o `install.sh` termine com um aviso.
- **Fim do `NativeCommandError` no PowerShell 5.1.** Toda chamada nativa (`wsl.exe`,
  `bcdedit`) passa pelo helper `Invoke-Nativo` (roda com `$ErrorActionPreference=Continue`
  e decide pelo `$LASTEXITCODE`), então o stderr do `wsl.exe` ("a máquina virtual…
  não está em execução") não aborta mais o instalador.
- **Auto-reparo do WSL.** Quando o Ubuntu não sobe mesmo com a virtualização ligada
  na BIOS, o `setup.ps1` tenta `wsl --shutdown`, liga as features
  `Microsoft-Windows-Subsystem-Linux` e `VirtualMachinePlatform`, ajusta
  `bcdedit hypervisorlaunchtype` para `Auto` e faz uma segunda tentativa antes de
  pedir reinício — e só então cai na mensagem amigável.

## Versionamento (para mantenedores)

Os one-liners apontam para a **tag** `client-installer-v12`, não para `main`.
Motivo: `main` é mutável — qualquer commit no repo mudaria o que os clientes já
distribuídos executam. Uma tag é imutável e intencional: o cliente sempre roda
exatamente o que foi revisado naquela release.

> **Compatibilidade com `.cmd` antigos (v1–v11).** Um `Instalar-Frinus.cmd` já
> distribuído aponta para `raw.githubusercontent.com/.../client-installer-vN/install/setup.ps1`.
> Para que essas cópias antigas rodem a v12, as tags `client-installer-v1..v11`
> foram **movidas (force) para o commit da v12** — toda tag antiga passa a servir
> os scripts da v12. Ao publicar uma versão nova, mova de novo as tags antigas
> para o commit novo (ou mantenha esse procedimento no `publicar-release-mcp`).

Para publicar/atualizar:

```bash
# na branch com estes arquivos, após revisar:
git tag client-installer-v12        # a cada nova release do instalador
git push origin feat/client-installer --tags

# mover as tags antigas para o commit da v12 (cópias antigas rodam a v12):
NEW=$(git rev-parse client-installer-v12)
for n in $(seq 1 11); do git tag -f client-installer-v$n "$NEW"; done
git push origin --force $(for n in $(seq 1 11); do echo client-installer-v$n; done)

# ao mudar os scripts: recalcule os hashes e atualize o bloco SHA-256 acima
sha256sum install/install.sh install/setup.ps1 install/Instalar-Frinus.cmd install/Corrigir-Atalho-Frinus.cmd install/frinus.ico
```

Para trocar a versão que os clientes usam, atualize o número da tag nos one-liners
(neste README e no material comercial). O `setup.ps1` carrega a tag na variável `$Tag`
(usada para baixar o `install.sh` e a si mesmo após o reinício), e o `Instalar-Frinus.cmd`
tem a URL com a tag — mantenha os três na mesma tag.

---
*Uma solução RDX.*
