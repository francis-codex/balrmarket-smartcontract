#!/bin/bash

echo "========================================="
echo "IDL Synchronization and Cache Clear Script"
echo "========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths
CONTRACT_DIR="/Users/franciscodex/balrmarket-smartcontract"
FRONTEND_DIR="/Users/franciscodex/BalrMarket-Frontend"
IDL_SOURCE="$CONTRACT_DIR/target/idl/balrmarket.json"
TYPES_SOURCE="$CONTRACT_DIR/target/types/balrmarket.ts"

echo ""
echo "Step 1: Verifying contract IDL exists..."
if [ ! -f "$IDL_SOURCE" ]; then
    echo -e "${RED}ERROR: IDL not found at $IDL_SOURCE${NC}"
    echo "Run 'anchor build' first!"
    exit 1
fi
echo -e "${GREEN}✓ IDL found${NC}"

echo ""
echo "Step 2: Copying IDL files to frontend..."
cp "$IDL_SOURCE" "$FRONTEND_DIR/src/lib/idl.json"
cp "$IDL_SOURCE" "$FRONTEND_DIR/src/components/utils/abi.json"
echo -e "${GREEN}✓ IDL files copied${NC}"

echo ""
echo "Step 3: Copying TypeScript types to frontend..."
if [ -f "$TYPES_SOURCE" ]; then
    cp "$TYPES_SOURCE" "$FRONTEND_DIR/src/lib/types.ts"
    echo -e "${GREEN}✓ Types copied${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Types file not found at $TYPES_SOURCE${NC}"
fi

echo ""
echo "Step 4: Verifying all files match..."
MD5_IDL=$(md5 -q "$IDL_SOURCE")
MD5_LIB=$(md5 -q "$FRONTEND_DIR/src/lib/idl.json")
MD5_ABI=$(md5 -q "$FRONTEND_DIR/src/components/utils/abi.json")

if [ "$MD5_IDL" == "$MD5_LIB" ] && [ "$MD5_IDL" == "$MD5_ABI" ]; then
    echo -e "${GREEN}✓ All IDL files match (MD5: $MD5_IDL)${NC}"
else
    echo -e "${RED}✗ IDL files DO NOT match!${NC}"
    echo "Source: $MD5_IDL"
    echo "Lib:    $MD5_LIB"
    echo "ABI:    $MD5_ABI"
    exit 1
fi

echo ""
echo "Step 5: Clearing frontend caches..."
cd "$FRONTEND_DIR"
rm -rf .next
rm -rf node_modules/.cache
echo -e "${GREEN}✓ Caches cleared${NC}"

echo ""
echo "Step 6: Checking for primary_market_closed_at field..."
if grep -q '"name": "primary_market_closed_at"' "$FRONTEND_DIR/src/lib/idl.json"; then
    echo -e "${GREEN}✓ Field 'primary_market_closed_at' found in IDL${NC}"
else
    echo -e "${RED}✗ Field 'primary_market_closed_at' NOT found in IDL!${NC}"
    exit 1
fi

echo ""
echo "Step 7: Checking opta_probability types..."
OPTA_TYPE=$(grep -A 2 '"name": "optaProbabilityYes"' "$FRONTEND_DIR/src/lib/idl.json" | grep '"type"' | head -1)
if echo "$OPTA_TYPE" | grep -q '"u32"'; then
    echo -e "${GREEN}✓ optaProbabilityYes is u32${NC}"
else
    echo -e "${RED}✗ optaProbabilityYes is NOT u32!${NC}"
    echo "$OPTA_TYPE"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}✓ All checks passed!${NC}"
echo "========================================="
echo ""
echo -e "${YELLOW}IMPORTANT NEXT STEPS:${NC}"
echo "1. Restart your Next.js dev server (Ctrl+C and run 'npm run dev' again)"
echo "2. Hard refresh your browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)"
echo "3. Create a NEW event using the frontend"
echo "4. Place an order on the NEWLY created event (not old events)"
echo ""
echo -e "${RED}NOTE: Events created BEFORE the u16→u32 change are incompatible!${NC}"
echo "      You must use events created AFTER the latest deployment."
echo ""
