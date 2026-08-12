# Frinus — instalador para cliente final (Windows / Linux / macOS)

Instalador de **um comando** para quem nunca abriu um terminal. Ao final: o
assistente Claude instalado, a memória Frinus conectada à conta do cliente, e uma
memória de teste gravada e lida de volta como prova. Todas as mensagens são em
PT-BR, sem termos técnicos.

## Arquivos

| Arquivo | Onde roda | Papel |
|--------|-----------|-------|
| [`setup.ps1`](setup.ps1) | Windows (PowerShell) | Garante o WSL2/Ubuntu (instala + pede reboot na 1ª vez) e depois roda o instalador dentro do Ubuntu. |
| [`install.sh`](install.sh) | Dentro do WSL2, ou Linux/macOS direto | Instala o que faltar, conecta a memória e valida com um teste real. |

No **Windows nativo** a conexão de memória não é confiável; por isso o caminho
oficial leva o cliente para dentro do WSL2, onde funciona como no Linux.

## One-liner (o que o cliente cola)

**Windows** — abra o PowerShell **como Administrador** (na 1ª vez, por causa da
instalação do WSL2):

```powershell
irm https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v1/install/setup.ps1 | iex
```

**Linux / macOS** (ou dentro do Ubuntu, se preferir manual):

```bash
curl -fsSL https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v1/install/install.sh | bash
```

Os endereços apontam para a **tag imutável** `client-installer-v1` — ver
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
install.sh   b89490d9613707c2e5c65a47de5163c166896013a982fb87520b08333cc943e1
setup.ps1    0bea2c481f47d77e07d1fa2ce1ea4898a7cdea79c2e2cc27550fd628a0326a04
```

Conferir no Linux/macOS antes de rodar:

```bash
curl -fsSL https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v1/install/install.sh -o install.sh
sha256sum install.sh   # deve bater com o hash acima
less install.sh        # revise, depois: bash install.sh
```

Conferir no Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/frinus-ai/frinus-mcp/client-installer-v1/install/setup.ps1 -OutFile setup.ps1
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

Os one-liners apontam para a **tag** `client-installer-v1`, não para `main`.
Motivo: `main` é mutável — qualquer commit no repo mudaria o que os clientes já
distribuídos executam. Uma tag é imutável e intencional: o cliente sempre roda
exatamente o que foi revisado naquela release.

Para publicar/atualizar:

```bash
# na branch com estes arquivos, após revisar:
git tag client-installer-v1        # ou -v2, -v3... a cada nova release do instalador
git push origin main --tags        # ou push da branch + tag

# ao mudar os scripts: recalcule os hashes e crie uma tag NOVA (não mova a antiga)
sha256sum install/install.sh install/setup.ps1
```

Para trocar a versão que os clientes usam, atualize o número da tag nos one-liners
(neste README e no material comercial). O `setup.ps1` também carrega a tag no seu
URL default do `install.sh` — mantenha os dois na mesma tag.

---
*Uma solução RDX.*
