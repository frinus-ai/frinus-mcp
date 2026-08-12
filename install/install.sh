#!/usr/bin/env bash
# =============================================================================
# Frinus — Instalador do Assistente com Memória (para clientes)
# =============================================================================
# Este arquivo roda DENTRO do Ubuntu (WSL2 no Windows) ou direto no Linux/macOS.
# No Windows, quem chama este arquivo é o "frinus-setup.ps1".
#
# O que ele faz, de ponta a ponta:
#   1. Garante que os programas de base estão instalados (Node, Claude Code)
#   2. Pede a sua chave de acesso do Frinus (colada, sem aparecer na tela)
#   3. Descobre automaticamente a qual empresa a sua chave pertence
#   4. Conecta o assistente à sua memória do Frinus
#   5. Faz login na sua conta Claude (passo que só você pode fazer)
#   6. Testa de verdade: grava uma memória e confirma que ela foi lida
#
# Pode rodar quantas vezes quiser: ele detecta o que já existe e não duplica nada.
#
# Marca: RDX  |  Produto: Frinus
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Aparência das mensagens (tudo em português, sem termos técnicos)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; ROXO=$'\033[38;5;97m'; VERDE=$'\033[32m'
  AMBAR=$'\033[33m'; VERM=$'\033[31m'; FIM=$'\033[0m'
else
  B=""; DIM=""; ROXO=""; VERDE=""; AMBAR=""; VERM=""; FIM=""
fi

SUPORTE="Se precisar de ajuda, chame a equipe RDX que te enviou este instalador."

titulo()  { printf '\n%s%s%s\n' "$ROXO$B" "$1" "$FIM"; }
passo()   { printf '%s▸%s %s\n' "$ROXO" "$FIM" "$1"; }
ok()      { printf '%s✓%s %s\n' "$VERDE" "$FIM" "$1"; }
pulou()   { printf '%s•%s %s\n' "$DIM" "$FIM" "$1"; }
aviso()   { printf '%s!%s %s\n' "$AMBAR" "$FIM" "$1"; }

# Erro amigável e acionável: diz O QUE FAZER, nunca o detalhe técnico.
parar() {
  printf '\n%s✗ %s%s\n' "$VERM$B" "$1" "$FIM"
  if [ -n "${2:-}" ]; then printf '  %s\n' "$2"; fi
  printf '\n  %s\n\n' "$SUPORTE"
  exit 1
}

# Se algo inesperado quebrar, não deixamos uma tela técnica assustadora.
trap 'parar "Algo não saiu como esperado durante a instalação." "Tente rodar o instalador mais uma vez. Na maioria das vezes ele completa na segunda tentativa."' ERR

# ---------------------------------------------------------------------------
# Configuração (endereços oficiais do Frinus — não precisa mexer)
# ---------------------------------------------------------------------------
CP_URL="${FRINUS_CP_URL:-https://frinus-api.rdxsec.com.br}"
MEMORY_URL="${MEMORY_SERVICE_URL:-https://frinus-memory.rdxsec.com.br}"
NOME_CONEXAO="frinus-mcp"   # nome interno da conexão (mantém tudo consistente)

titulo "Frinus — vamos dar memória ao seu assistente"
printf '%sIsto leva poucos minutos. Você só vai precisar colar a sua chave e, uma vez,\nfazer login na sua conta Claude. O resto é automático.%s\n' "$DIM" "$FIM"

# ===========================================================================
# 1) Programas de base: Node e Claude Code
# ===========================================================================
titulo "1) Preparando os programas de base"

# --- Node (motor que o assistente usa por baixo) --------------------------
carregar_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
}

carregar_nvm
if command -v node >/dev/null 2>&1 && node -e 'process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)' 2>/dev/null; then
  pulou "Node já estava instalado ($(node --version)) — pulando."
else
  passo "Instalando o motor de base (Node). Pode levar 1–2 minutos..."
  if ! command -v curl >/dev/null 2>&1; then
    parar "Faltou um utilitário de rede no sistema." "Abra o Ubuntu e rode: sudo apt update && sudo apt install -y curl, depois rode o instalador de novo."
  fi
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1 \
    || parar "Não consegui instalar o motor de base." "Verifique sua conexão com a internet e tente de novo."
  carregar_nvm
  nvm install --lts >/dev/null 2>&1 || parar "Não consegui instalar o motor de base." "Verifique sua internet e tente de novo."
  carregar_nvm
  command -v node >/dev/null 2>&1 || parar "O motor de base não ficou disponível." "Feche esta janela, abra o Ubuntu de novo e rode o instalador mais uma vez."
  ok "Motor de base instalado ($(node --version))."
fi

# --- Claude Code (o assistente em si) -------------------------------------
if command -v claude >/dev/null 2>&1; then
  pulou "Assistente Claude já estava instalado — pulando."
else
  passo "Instalando o assistente Claude..."
  npm install -g @anthropic-ai/claude-code >/dev/null 2>&1 \
    || parar "Não consegui instalar o assistente." "Verifique sua internet e tente de novo."
  command -v claude >/dev/null 2>&1 || parar "O assistente não ficou disponível." "Feche esta janela, abra o Ubuntu de novo e rode o instalador mais uma vez."
  ok "Assistente Claude instalado."
fi

# ===========================================================================
# 2) Sua chave de acesso do Frinus
# ===========================================================================
titulo "2) Sua chave de acesso"

# A chave pode vir do ambiente (quando o Windows repassa) — mas o padrão e mais
# seguro é pedir aqui, com a digitação escondida (não aparece na tela, não fica
# guardada no histórico).
CHAVE="${FRINUS_API_KEY:-}"
if [ -z "$CHAVE" ]; then
  printf '%sCole a chave que a equipe RDX te enviou (começa com "sk-frinus-").\nEla NÃO vai aparecer na tela enquanto você cola — é normal, é por segurança.%s\n' "$DIM" "$FIM"
  printf 'Chave: '
  IFS= read -rs CHAVE || true
  printf '\n'
fi
CHAVE="$(printf '%s' "$CHAVE" | tr -d '[:space:]')"

case "$CHAVE" in
  sk-frinus-*) : ;;
  "") parar "Você não colou nenhuma chave." "Rode o instalador de novo e cole a chave que começa com sk-frinus-." ;;
  *)  parar "Essa chave não parece ser uma chave do Frinus." "A chave certa começa com sk-frinus-. Confira se copiou a linha inteira e tente de novo." ;;
esac
ok "Chave recebida."

# ===========================================================================
# 3) Descobrir automaticamente a empresa dona da chave
# ===========================================================================
titulo "3) Reconhecendo a sua conta"
passo "Confirmando a chave com o Frinus..."

RESP="$(curl -fsS -H "X-API-Key: $CHAVE" "$CP_URL/api/v1/templates/mcp-config" 2>/dev/null)" || {
  # Distingue "chave recusada" de "sem internet" pelo código HTTP.
  CODIGO="$(curl -s -o /dev/null -w '%{http_code}' -H "X-API-Key: $CHAVE" "$CP_URL/api/v1/templates/mcp-config" 2>/dev/null || echo 000)"
  case "$CODIGO" in
    401|403) parar "A sua chave não foi reconhecida." "Confira se copiou a chave inteira, sem espaços. Se o problema continuar, peça uma chave nova à equipe RDX." ;;
    000)     parar "Não consegui falar com o Frinus." "Verifique se você está conectado à internet e tente de novo." ;;
    *)       parar "O Frinus respondeu de forma inesperada (código $CODIGO)." "Tente de novo em alguns minutos." ;;
  esac
}

# Extrai identidade da empresa + o "cérebro" da conta (usando o Node, já instalado).
EMPRESA="$(printf '%s' "$RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.organization&&j.organization.name)||"")}catch(e){}})')"
CEREBRO_ID="$(printf '%s' "$RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.orchestrator_id||"")}catch(e){}})')"

[ -n "$EMPRESA" ] || EMPRESA="sua empresa"
ok "Conta reconhecida: ${B}${EMPRESA}${FIM}"
if [ -z "$CEREBRO_ID" ]; then
  aviso "A sua conta ainda não tem um assistente principal configurado."
  aviso "A memória vai funcionar mesmo assim; a equipe RDX pode finalizar esse detalhe depois."
fi

# ===========================================================================
# 4) Login na conta Claude (o único passo que só VOCÊ pode fazer)
# ===========================================================================
titulo "4) Login na sua conta Claude"

# Atalho SÓ para testes/CI (nunca usado pelo cliente): o one-liner do cliente
# jamais define esta variável. Ela pula o passo de login interativo — que é o
# único passo impossível de automatizar (abre o navegador). Não mascara falha
# real do cliente: a conexão da memória e o teste final (passo 8) dependem da
# chave do Frinus, não do login do Claude.
if [ "${FRINUS_SELFTEST_SKIP_LOGIN:-}" = "1" ]; then
  aviso "[autoteste] Passo de login pulado (modo de verificação interna)."
  LOGADO="sim"
else
LOGADO="$(claude auth status 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).loggedIn?"sim":"nao")}catch(e){process.stdout.write("nao")}})' 2>/dev/null || echo nao)"
fi

if [ "$LOGADO" = "sim" ]; then
  pulou "Você já está logado na sua conta Claude — pulando."
else
  printf '%sAgora abre a etapa de login. Vai aparecer um endereço/código na tela:\n' "$DIM"
  printf '  • copie o endereço no seu navegador (ou siga as instruções que aparecerem);\n'
  printf '  • entre com a sua conta Claude (plano Pro ou Max);\n'
  printf '  • quando terminar, esta janela segue sozinha.%s\n\n' "$FIM"
  printf 'Pressione ENTER para começar o login... '
  read -r _ || true
  claude auth login || parar "O login não foi concluído." "Rode o instalador de novo e complete o login na sua conta Claude."
  LOGADO="$(claude auth status 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).loggedIn?"sim":"nao")}catch(e){process.stdout.write("nao")}})' 2>/dev/null || echo nao)"
  [ "$LOGADO" = "sim" ] || parar "O login ainda não foi concluído." "Rode o instalador de novo e finalize o login na sua conta Claude."
  ok "Login concluído."
fi

# Aviso gentil se o plano não permitir usar o assistente (não bloqueia).
PLANO="$(claude auth status 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s).subscriptionType||"").toLowerCase())}catch(e){}})' 2>/dev/null || echo '')"
case "$PLANO" in
  pro|max|team|enterprise|"") : ;;
  *) aviso "A sua conta Claude parece estar no plano gratuito. Para conversar com o assistente é necessário o plano Pro ou Max." ;;
esac

# ===========================================================================
# 5) Conectar o assistente à sua memória (idempotente)
# ===========================================================================
titulo "5) Conectando o assistente à sua memória"

# Remove uma conexão anterior (se existir) e cria de novo — assim rodar duas
# vezes nunca duplica nem deixa configuração pela metade. A chave entra por
# variável (não fica no histórico) e é gravada pelo próprio Claude.
claude mcp remove "$NOME_CONEXAO" -s user >/dev/null 2>&1 || true
FRINUS_KEY_TMP="$CHAVE" claude mcp add "$NOME_CONEXAO" -s user \
  -e FRINUS_API_KEY="$CHAVE" \
  -- npx -y frinus-mcp@latest >/dev/null 2>&1 \
  || parar "Não consegui conectar o assistente à sua memória." "Rode o instalador de novo. Se continuar, peça ajuda à equipe RDX."
ok "Conexão criada."

# ===========================================================================
# 6) Instruções de partida do assistente (memória sempre ligada)
# ===========================================================================
titulo "6) Ligando a memória por padrão"

CFG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
mkdir -p "$CFG_DIR"
CLAUDE_MD="$CFG_DIR/CLAUDE.md"

# Bloco mínimo de partida. Se não houver um "cérebro" da conta, cai num modo
# genérico que ainda usa a memória. Marcadores permitem reescrever só a nossa
# parte, sem tocar em nada que o cliente tenha escrito.
if [ -n "$CEREBRO_ID" ]; then
  BLOCO="$(cat <<EOF
<!-- FRINUS:INICIO (gerado automaticamente — não edite entre estas marcas) -->
Você é o agente ${CEREBRO_ID}.
Antes de qualquer tarefa não-trivial, chame agent_bootstrap(agent_id="${CEREBRO_ID}") e adote identity + system_prompt + runtime como suas instruções.
Ao saturar o contexto ou a cada N respostas, chame agent_reorient(agent_id="${CEREBRO_ID}").
Ao concluir algo relevante, salve com memory_store.
Memória indisponível? Avise: "Frinus offline — memória reduzida."
<!-- FRINUS:FIM -->
EOF
)"
else
  BLOCO="$(cat <<EOF
<!-- FRINUS:INICIO (gerado automaticamente — não edite entre estas marcas) -->
Você tem memória de longo prazo pelo Frinus. Antes de qualquer tarefa não-trivial, recupere contexto com memory_search. Ao concluir algo relevante, salve com memory_store.
Memória indisponível? Avise: "Frinus offline — memória reduzida."
<!-- FRINUS:FIM -->
EOF
)"
fi

if [ -f "$CLAUDE_MD" ] && grep -q "FRINUS:INICIO" "$CLAUDE_MD"; then
  # Já existe nosso bloco → substitui apenas ele (idempotente), preserva o resto.
  TMP="$(mktemp)"
  BLOCO="$BLOCO" node -e '
    const fs=require("fs");
    const f=process.argv[1];
    const bloco=process.env.BLOCO;
    let t=fs.readFileSync(f,"utf8");
    t=t.replace(/<!-- FRINUS:INICIO[\s\S]*?<!-- FRINUS:FIM -->/, bloco);
    fs.writeFileSync(process.argv[2],t);
  ' "$CLAUDE_MD" "$TMP"
  mv "$TMP" "$CLAUDE_MD"
  ok "Instruções de partida atualizadas."
elif [ -f "$CLAUDE_MD" ]; then
  # Existe um CLAUDE.md do cliente, mas sem nosso bloco → acrescenta ao final.
  printf '\n%s\n' "$BLOCO" >> "$CLAUDE_MD"
  ok "Instruções de partida adicionadas (o que você já tinha foi preservado)."
else
  printf '%s\n' "$BLOCO" > "$CLAUDE_MD"
  ok "Instruções de partida criadas."
fi

# ===========================================================================
# 7) Equipe de especialistas (opcional, mas recomendado)
# ===========================================================================
# Sem estes dois arquivos, pedir ajuda a um especialista específico falha em
# silêncio. Custo zero e idempotente, então instalamos por padrão.
titulo "7) Preparando a equipe de especialistas"
AGENTS_DIR="$CFG_DIR/agents"
mkdir -p "$AGENTS_DIR"

if [ -n "$CEREBRO_ID" ]; then
  cat > "$AGENTS_DIR/frinus.md" <<EOF
---
name: frinus
description: "orquestração, roteamento e coordenação de agentes especializados"
agentId: ${CEREBRO_ID}
is_orchestrator: true
can_delegate: true
model: inherit
color: "violet"
language: pt-BR
---

> REGRA ZERO — MCP é obrigatório. O Frinus é sua memória de longo prazo, identidade e inteligência. Antes de qualquer tarefa não-trivial confirme que as ferramentas de memória estão acessíveis; se não, avise: "Frinus offline — memória reduzida." e opere com cautela.

## Regra de Boot (fonte única)
Você é o agente \`${CEREBRO_ID}\`. Antes de responder qualquer mensagem não-trivial, chame:
\`\`\`
agent_bootstrap(agent_id="${CEREBRO_ID}")
\`\`\`
Adote identity + system_prompt + runtime retornados como suas instruções. A cada reorient_every_n respostas (ou ao saturar contexto) chame agent_reorient(agent_id="${CEREBRO_ID}").

## Delegação real (sem impersonate)
1. agent_list() → roster + IDs. 2. (opcional) task_create(assigned_agent_id="<id>") → task_id. 3. Spawn subagent frinus-specialist com a 1ª linha do prompt = "AGENT_ID: <uuid do especialista>" (e opcional "TASK_ID: <uuid>"), seguido de brief autocontido. Fan-out: várias chamadas no mesmo turno. NUNCA use general-purpose quando há especialista de domínio.
EOF

  cat > "$AGENTS_DIR/frinus-specialist.md" <<'EOF'
---
name: frinus-specialist
description: "Subagent camaleão Frinus. Recebe AGENT_ID na 1ª linha do prompt, faz agent_bootstrap e se personifica como o especialista. Use para delegar qualquer especialista do time no CLI — NÃO use general-purpose quando há especialista de domínio."
model: inherit
color: "violet"
language: pt-BR
---

> REGRA ZERO — MCP é obrigatório. Confirme que as ferramentas de memória (agent_bootstrap, memory_search) estão acessíveis; se não, avise "Frinus offline — memória reduzida." e opere com cautela.

## Boot dinâmico
Você é um agente camaleão: sua identidade vem do AGENT_ID passado no prompt.
1. Leia o AGENT_ID na 1ª linha (formato: "AGENT_ID: <uuid>" e opcional "TASK_ID: <uuid>", depois o briefing).
2. agent_bootstrap(agent_id="<o AGENT_ID lido>") e adote identity + system_prompt + runtime como suas instruções — a partir daqui você É esse especialista.
3. agent_reorient(agent_id="<AGENT_ID>") ao saturar contexto.

## Se houver TASK_ID
task_update(task_id="<TASK_ID>", status="running") no início; status="completed", output_data={...} no fim; status="failed", error_message="..." em falha.

## Entrega
Você começou em contexto frio: o briefing é tudo. Devolva resultado técnico autocontido (o orquestrador sintetiza). Salve aprendizados via memory_store. Se não houver AGENT_ID válido ou o bootstrap falhar, avise e não invente identidade.
EOF
  ok "Equipe de especialistas pronta."
else
  pulou "Sem assistente principal configurado — pulando a equipe por enquanto."
fi

# ===========================================================================
# 8) Teste de verdade: gravar e ler uma memória
# ===========================================================================
titulo "8) Testando a memória de verdade"

# Parte A — a conexão está viva? (o assistente enxerga a memória)
passo "Verificando a conexão..."
CONECTADO="nao"
for tentativa in 1 2 3; do
  if claude mcp list 2>/dev/null | grep -Eiq "^${NOME_CONEXAO}:.*(Connected|✔)"; then
    CONECTADO="sim"; break
  fi
  sleep 3
done
if [ "$CONECTADO" != "sim" ]; then
  # Segunda chance: qualquer linha do frinus marcada como conectada.
  claude mcp list 2>/dev/null | grep -Eiq "${NOME_CONEXAO}.*(Connected|✔)" && CONECTADO="sim" || true
fi
[ "$CONECTADO" = "sim" ] \
  && ok "Conexão ativa." \
  || parar "A conexão com a memória não respondeu a tempo." "Isso costuma resolver na segunda tentativa: rode o instalador de novo."

# Parte B — grava uma memória real e confirma que ela pode ser lida de volta.
passo "Gravando uma memória de teste e lendo de volta..."
CARIMBO="INSTALACAO-$(date +%s)"
ALVO_ID="${CEREBRO_ID:-00000000-0000-0000-0000-000000000001}"

CRIA="$(curl -fsS -X POST "$MEMORY_URL/memories" \
  -H "X-API-Key: $CHAVE" -H "Content-Type: application/json" \
  -d "{\"agent_id\":\"$ALVO_ID\",\"content\":\"$CARIMBO memoria de teste da instalacao, pode apagar\",\"memory_type\":\"episodic\",\"importance\":0.1,\"scope\":\"user\"}" 2>/dev/null)" \
  || parar "Não consegui gravar a memória de teste." "Rode o instalador de novo. Se continuar, peça uma chave nova à equipe RDX."

MEM_ID="$(printf '%s' "$CRIA" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch(e){}})')"

ENCONTROU="$(curl -fsS -X POST "$MEMORY_URL/memories/search" \
  -H "X-API-Key: $CHAVE" -H "Content-Type: application/json" \
  -d "{\"query_text\":\"$CARIMBO\",\"limit\":3}" 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);process.stdout.write(a.some(m=>(m.content||"").includes(process.argv[1]))?"sim":"nao")}catch(e){process.stdout.write("nao")}})' "$CARIMBO")"

# Limpa a memória de teste para não poluir a base do cliente.
if [ -n "$MEM_ID" ]; then
  curl -fsS -o /dev/null -X DELETE "$MEMORY_URL/memories/$MEM_ID" -H "X-API-Key: $CHAVE" 2>/dev/null || true
fi

[ "$ENCONTROU" = "sim" ] \
  && ok "Memória gravada e recuperada com sucesso." \
  || parar "A memória foi gravada, mas não consegui confirmar a leitura." "Rode o instalador de novo. Se continuar, peça ajuda à equipe RDX."

# ===========================================================================
# Fim
# ===========================================================================
titulo "Tudo pronto! 🎉"
printf '%sO seu assistente agora tem memória, ligada à conta de %s%s%s.%s\n\n' "$DIM" "$B" "$EMPRESA" "$FIM$DIM" "$FIM"
printf '%sComo usar a partir de agora:%s\n' "$B" "$FIM"
printf '  1. Abra o Ubuntu (no Windows) ou o terminal (no Mac/Linux).\n'
printf '  2. Digite %sclaude%s e pressione ENTER.\n' "$B" "$FIM"
printf '  3. Peça algo e mande ele lembrar. Ex.: %s"Guarde na memória: nossa reunião semanal é toda terça às 10h."%s\n' "$DIM" "$FIM"
printf '  4. Depois, em outra conversa, pergunte: %s"Que dia é a nossa reunião semanal?"%s\n\n' "$DIM" "$FIM"
printf '%s%s%s\n\n' "$DIM" "Uma solução RDX." "$FIM"
