# Frinus — instalador para cliente final (Windows / Linux / macOS)

Instalador de **um comando** para quem nunca abriu um terminal. Ao final: o
assistente Claude instalado, a memória Frinus conectada à conta do cliente, e uma
memória de teste gravada e lida de volta como prova. Todas as mensagens são em
PT-BR, sem termos técnicos.

## Arquivos

| Arquivo | Onde roda | Papel |
|--------|-----------|-------|
| [`Instalar-Frinus.cmd`](Instalar-Frinus.cmd) | Windows (duplo clique) | Atalho de 1 clique: só chama o `setup.ps1` da tag publicada. É o arquivo que se distribui (pendrive, pasta de rede, e-mail). |
| [`frinus.ico`](frinus.ico) | Windows | Ícone do atalho "Frinus" (gerado de `frontend/public/logo.svg`, 16–256 px). Se o download falhar, o atalho usa o ícone do WSL. |
| [`setup.ps1`](setup.ps1) | Windows (PowerShell) | Pede admin sozinho, pede a chave, instala o WSL2/Ubuntu, **reinicia e continua sozinho**, cria usuário/senha do Ubuntu, roda o instalador lá dentro e cria o atalho "Frinus" na área de trabalho. |
| [`install.sh`](install.sh) | Dentro do WSL2, ou Linux/macOS direto | Instala o que faltar, conecta a memória e valida com um teste real. |

No **Windows nativo** a conexão de memória não é confiável; por isso o caminho
oficial leva o cliente para dentro do WSL2, onde funciona como no Linux.

## One-liner (o que o cliente cola)

**Windows** — dê **duplo clique** em `Instalar-Frinus.cmd`. Ou, num PowerShell:

```powershell
irm https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v9/install/setup.ps1 | iex
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
curl -fsSL https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v9/install/install.sh | bash
```

Os endereços apontam para a **tag imutável** `client-installer-v9` — ver
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
install.sh            9d2c4380067e5076d071dcabed33afdf4afb5971a3ff33392dad064d4177a17d
setup.ps1             63622e56a499e00618e3d534b0f13810066c9b788f638465fddd59b0aaee58c6
Instalar-Frinus.cmd   fd4dc3a436bec22589a366215bf7ecfdf34ac56f3ce185b20537871bb0e995ab
frinus.ico            d5ad20d853234a77df9d4e667e6eec53b0cd97933d2a937eaff7573d5effa8b6
```

Conferir no Linux/macOS antes de rodar:

```bash
curl -fsSL https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v9/install/install.sh -o install.sh
sha256sum install.sh   # deve bater com o hash acima
less install.sh        # revise, depois: bash install.sh
```

Conferir no Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v9/install/setup.ps1 -OutFile setup.ps1
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

## Versionamento (para mantenedores)

Os one-liners apontam para a **tag** `client-installer-v9`, não para `main`.
Motivo: `main` é mutável — qualquer commit no repo mudaria o que os clientes já
distribuídos executam. Uma tag é imutável e intencional: o cliente sempre roda
exatamente o que foi revisado naquela release.

Para publicar/atualizar:

```bash
# na branch com estes arquivos, após revisar:
git tag client-installer-v9        # ou -v3, -v4... a cada nova release do instalador
git push origin main --tags        # ou push da branch + tag

# ao mudar os scripts: recalcule os hashes e crie uma tag NOVA (não mova a antiga)
sha256sum install/install.sh install/setup.ps1
```

Para trocar a versão que os clientes usam, atualize o número da tag nos one-liners
(neste README e no material comercial). O `setup.ps1` carrega a tag na variável `$Tag`
(usada para baixar o `install.sh` e a si mesmo após o reinício), e o `Instalar-Frinus.cmd`
tem a URL com a tag — mantenha os três na mesma tag.

---
*Uma solução RDX.*
