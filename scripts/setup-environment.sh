#!/bin/bash

# PodDNA Local Environment Setup
# Run this once to set up your local environment

echo "╔════════════════════════════════════════════════════════╗"
echo "║      PodDNA Local Environment Setup                    ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
  OS="windows"
fi

echo "Detected OS: $OS"
echo ""

# Check and install dependencies
echo "📦 Checking dependencies..."
echo ""

# Check yt-dlp
if command -v yt-dlp >/dev/null 2>&1; then
  YT_DLP_VERSION=$(yt-dlp --version)
  echo "✓ yt-dlp installed (version $YT_DLP_VERSION)"
else
  echo "✗ yt-dlp not found"
  echo "  Installing yt-dlp..."
  
  if [ "$OS" == "macos" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install yt-dlp
    elif command -v pip3 >/dev/null 2>&1; then
      pip3 install yt-dlp
    else
      echo "  Please install yt-dlp: pip3 install yt-dlp"
    fi
  elif [ "$OS" == "linux" ]; then
    pip install yt-dlp || pip3 install yt-dlp
  elif [ "$OS" == "windows" ]; then
    echo "  Please install yt-dlp: pip install yt-dlp"
  fi
fi

# Check jq
if command -v jq >/dev/null 2>&1; then
  echo "✓ jq installed"
else
  echo "✗ jq not found"
  echo "  Installing jq..."
  
  if [ "$OS" == "macos" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install jq
    else
      echo "  Please install jq from: https://stedolan.github.io/jq/download/"
    fi
  elif [ "$OS" == "linux" ]; then
    sudo apt-get update && sudo apt-get install -y jq || sudo yum install -y jq
  elif [ "$OS" == "windows" ]; then
    echo "  Please install jq from: https://stedolan.github.io/jq/download/"
  fi
fi

# Check curl
if command -v curl >/dev/null 2>&1; then
  echo "✓ curl installed"
else
  echo "✗ curl not found (usually pre-installed)"
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          Configuration Setup                           ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Create config directory
CONFIG_DIR="$HOME/.poddna"
mkdir -p "$CONFIG_DIR"

# Check if config exists
if [ -f "$CONFIG_DIR/config.env" ]; then
  echo "⚠️  Config file already exists: $CONFIG_DIR/config.env"
  echo ""
  read -p "Overwrite? (y/n): " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Keeping existing config"
    exit 0
  fi
fi

# Get server URL
echo "Enter your Replit server URL:"
echo "(e.g., https://pod-genius-wayneselman.replit.app)"
read -p "Server URL: " SERVER_URL

# Get API key
echo ""
echo "Enter your PodDNA admin API key:"
echo "(Find this in your Replit secrets - ADMIN_API_KEY)"
read -p "API Key: " API_KEY

# Save config
cat > "$CONFIG_DIR/config.env" << EOF
# PodDNA Local Configuration
# Generated on $(date)

export PODDNA_SERVER="$SERVER_URL"
export PODDNA_API_KEY="$API_KEY"
EOF

chmod 600 "$CONFIG_DIR/config.env"

echo ""
echo "✓ Config saved to: $CONFIG_DIR/config.env"
echo ""

# Add to shell profile
SHELL_PROFILE=""
if [ -f "$HOME/.zshrc" ]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_PROFILE="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  SHELL_PROFILE="$HOME/.bash_profile"
fi

if [ -n "$SHELL_PROFILE" ]; then
  if ! grep -q "poddna/config.env" "$SHELL_PROFILE"; then
    echo ""
    echo "Add to shell profile?"
    echo "This will automatically load config when you open a terminal"
    read -p "Add to $SHELL_PROFILE? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo "" >> "$SHELL_PROFILE"
      echo "# PodDNA Configuration" >> "$SHELL_PROFILE"
      echo "source $CONFIG_DIR/config.env" >> "$SHELL_PROFILE"
      echo "✓ Added to $SHELL_PROFILE"
      echo "  Run: source $SHELL_PROFILE"
    fi
  fi
fi

# Test connection
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          Testing Connection                            ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

source "$CONFIG_DIR/config.env"

echo "Testing connection to $PODDNA_SERVER..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "X-Admin-API-Key: $PODDNA_API_KEY" "$PODDNA_SERVER/api/admin/health" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" == "200" ]; then
  echo "✓ Server is reachable"
  echo "✓ API key is valid"
  echo "$BODY" | jq -r '"  Auth method: " + .authMethod' 2>/dev/null || true
elif [ "$HTTP_CODE" == "401" ]; then
  echo "✗ API key is invalid"
  echo "  Check your ADMIN_API_KEY in Replit secrets"
else
  echo "✗ Server not reachable (HTTP $HTTP_CODE)"
  echo "  Check your server URL and make sure it's running"
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          Setup Complete!                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Make scripts executable:"
echo "     chmod +x download-clips.sh"
echo ""
echo "  2. List pending clips:"
echo "     ./download-clips.sh list"
echo ""
echo "  3. Download a specific clip:"
echo "     ./download-clips.sh download <clip_id>"
echo ""
