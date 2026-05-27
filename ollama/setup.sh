#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Walk With Me — Local Model Setup Script
#  Creates the custom "walk-with-me" Ollama model from llama3.1:8b
# ─────────────────────────────────────────────────────────────────────────────

set -e

BOLD=$(tput bold 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELFILE="$SCRIPT_DIR/Modelfile"
MODEL_NAME="walk-with-me"
BASE_MODEL="llama3.1:8b"

echo ""
echo -e "${BLUE}${BOLD}✝  Walk With Me — Local Model Setup${RESET}"
echo "────────────────────────────────────────"
echo ""

# ── 1. Check Ollama is installed ─────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
  echo "❌  Ollama is not installed."
  echo "    Install it from: https://ollama.com/download"
  exit 1
fi
echo -e "${GREEN}✓${NC}  Ollama found: $(ollama --version 2>/dev/null | head -1)"

# ── 2. Start Ollama server if not already running ────────────────────────────
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
  echo -e "${YELLOW}⏳  Starting Ollama server...${NC}"
  ollama serve &>/dev/null &
  OLLAMA_PID=$!
  sleep 3
  if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
    echo "❌  Could not start Ollama server. Please run 'ollama serve' manually."
    exit 1
  fi
  echo -e "${GREEN}✓${NC}  Ollama server started (PID: $OLLAMA_PID)"
else
  echo -e "${GREEN}✓${NC}  Ollama server is already running"
fi

# ── 3. Pull base model if not already present ────────────────────────────────
echo ""
if ollama list 2>/dev/null | grep -q "$BASE_MODEL"; then
  echo -e "${GREEN}✓${NC}  Base model '$BASE_MODEL' already downloaded"
else
  echo -e "${YELLOW}⏳${NC}  Downloading base model '$BASE_MODEL' (~4.7 GB)..."
  echo "    This may take several minutes depending on your connection."
  echo ""
  ollama pull "$BASE_MODEL"
  echo ""
  echo -e "${GREEN}✓${NC}  Base model downloaded successfully"
fi

# ── 4. Create the custom walk-with-me model ──────────────────────────────────
echo ""
echo -e "${YELLOW}⏳${NC}  Creating custom '$MODEL_NAME' model from Modelfile..."
ollama create "$MODEL_NAME" -f "$MODELFILE"
echo ""
echo -e "${GREEN}✓${NC}  Model '$MODEL_NAME' created successfully!"

# ── 5. Quick smoke test ───────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
echo -e "${YELLOW}⏳${NC}  Running a quick test response..."
echo ""
RESPONSE=$(ollama run "$MODEL_NAME" "Say hello in one sentence as the Walk With Me companion." 2>/dev/null | head -3)
echo -e "${BLUE}Model response:${NC} $RESPONSE"

# ── 6. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
echo -e "${GREEN}${BOLD}✝  Setup complete!${RESET}"
echo ""
echo "  Next steps:"
echo "  1. Make sure Ollama is running:  ollama serve"
echo "  2. Start the web app:            npm run dev"
echo "  3. Open your browser:            http://localhost:3000"
echo ""
