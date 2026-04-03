#!/bin/bash
# Setup devnet deployment for MagicBlock ER
set -e

echo "=== MONARCHY Deploy Script ==="
echo ""

# Check tools
command -v solana >/dev/null 2>&1 || { echo "Install solana-cli first"; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "Install anchor-cli first"; exit 1; }

# Build program
echo "[1/4] Building Solana program..."
cd programs
cargo build-sbf --manifest-path monopoly/Cargo.toml
cd ..

# Deploy
echo "[2/4] Deploying to devnet..."
anchor deploy

echo "[3/4] Extract program ID from deploy output above"
echo "Update .env PROGRAM_ID= line"

echo "[4/4] Done! Start with: npm run dev:server"
