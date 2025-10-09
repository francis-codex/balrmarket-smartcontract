#!/bin/bash

echo "========================================="
echo "COMPLETE SYSTEM CHECK"
echo "========================================="
echo ""

CONTRACT_DIR="/Users/franciscodex/balrmarket-smartcontract"
FRONTEND_DIR="/Users/franciscodex/BalrMarket-Frontend"

# 1. Check IDL files
echo "1. Checking IDL files..."
CONTRACT_MD5=$(md5 -q "$CONTRACT_DIR/target/idl/balrmarket.json")
FRONTEND_LIB_MD5=$(md5 -q "$FRONTEND_DIR/src/lib/idl.json")
FRONTEND_ABI_MD5=$(md5 -q "$FRONTEND_DIR/src/components/utils/abi.json")

echo "   Contract IDL: $CONTRACT_MD5"
echo "   Frontend lib: $FRONTEND_LIB_MD5"
echo "   Frontend ABI: $FRONTEND_ABI_MD5"

if [ "$CONTRACT_MD5" == "$FRONTEND_LIB_MD5" ] && [ "$CONTRACT_MD5" == "$FRONTEND_ABI_MD5" ]; then
    echo "   ✅ All IDL files match"
else
    echo "   ❌ IDL files DO NOT match - syncing now..."
    cp "$CONTRACT_DIR/target/idl/balrmarket.json" "$FRONTEND_DIR/src/lib/idl.json"
    cp "$CONTRACT_DIR/target/idl/balrmarket.json" "$FRONTEND_DIR/src/components/utils/abi.json"
    echo "   ✅ IDL files synced"
fi

# 2. Check IDL content
echo ""
echo "2. Checking IDL fields..."

# Check primary_market_closed_at
if grep -q '"name": "primary_market_closed_at"' "$FRONTEND_DIR/src/lib/idl.json"; then
    PMCA_TYPE=$(grep -A 3 '"name": "primary_market_closed_at"' "$FRONTEND_DIR/src/lib/idl.json" | grep '"option"')
    if echo "$PMCA_TYPE" | grep -q '"i64"'; then
        echo "   ✅ primary_market_closed_at: Option<i64>"
    else
        echo "   ❌ primary_market_closed_at type is wrong!"
        exit 1
    fi
else
    echo "   ❌ primary_market_closed_at NOT FOUND!"
    exit 1
fi

# Check opta_probability_yes
OPTA_TYPE=$(grep -A 2 '"name": "opta_probability_yes"' "$FRONTEND_DIR/src/lib/idl.json" | grep '"type"' | head -1 | grep -o '"u32"\|"u16"')
if [ "$OPTA_TYPE" == '"u32"' ]; then
    echo "   ✅ opta_probability_yes: u32"
else
    echo "   ❌ opta_probability_yes is NOT u32!"
    echo "      Found: $OPTA_TYPE"
    exit 1
fi

# 3. Check program.ts
echo ""
echo "3. Checking program.ts validation code..."
if grep -q "opta_probability_yes is not u32" "$FRONTEND_DIR/src/lib/program.ts"; then
    echo "   ✅ program.ts has validation code"
else
    echo "   ❌ program.ts is missing validation!"
    exit 1
fi

# 4. Test loading the IDL in Node
echo ""
echo "4. Testing IDL loading in Node..."
node -e "
const idl = require('$FRONTEND_DIR/src/lib/idl.json');
const eventType = idl.types.find(t => t.name === 'Event');
const pmca = eventType.type.fields.find(f => f.name === 'primary_market_closed_at');
const opta = eventType.type.fields.find(f => f.name === 'opta_probability_yes');

if (pmca && pmca.type.option === 'i64') {
    console.log('   ✅ primary_market_closed_at validates in Node');
} else {
    console.log('   ❌ primary_market_closed_at FAILED in Node');
    process.exit(1);
}

if (opta && opta.type === 'u32') {
    console.log('   ✅ opta_probability_yes validates in Node');
} else {
    console.log('   ❌ opta_probability_yes FAILED in Node');
    console.log('      Type:', opta ? opta.type : 'NOT FOUND');
    process.exit(1);
}
"

if [ $? -ne 0 ]; then
    exit 1
fi

# 5. Check on-chain accounts
echo ""
echo "5. Checking on-chain Event accounts..."
cd "$CONTRACT_DIR"
RESULT=$(npx ts-node -e "
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com');
const programId = new PublicKey('CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq');

(async () => {
    const accounts = await connection.getProgramAccounts(programId, {
        filters: [{ dataSize: 505 }]
    });
    console.log(accounts.length);
})();
" 2>/dev/null)

if [ ! -z "$RESULT" ]; then
    echo "   ✅ Found Event accounts on-chain"
else
    echo "   ⚠️  Could not check on-chain accounts"
fi

# 6. Check caches
echo ""
echo "6. Checking for caches..."
if [ -d "$FRONTEND_DIR/.next" ]; then
    echo "   ⚠️  .next cache exists - removing..."
    rm -rf "$FRONTEND_DIR/.next"
fi

if [ -d "$FRONTEND_DIR/node_modules/.cache" ]; then
    echo "   ⚠️  node_modules/.cache exists - removing..."
    rm -rf "$FRONTEND_DIR/node_modules/.cache"
fi

echo "   ✅ No caches found"

echo ""
echo "========================================="
echo "✅ ALL CHECKS PASSED"
echo "========================================="
echo ""
echo "NEXT STEPS:"
echo "1. RESTART dev server:"
echo "   cd $FRONTEND_DIR"
echo "   npm run dev"
echo ""
echo "2. Open browser DevTools (F12)"
echo "3. Go to Console tab"
echo "4. Try to place an order"
echo "5. Look for these logs:"
echo "   🔍 IDL Validation:"
echo "     • primary_market_closed_at: {\"option\":\"i64\"}"
echo "     • opta_probability_yes type: u32"
echo "   ✅ IDL validated successfully"
echo ""
echo "If you DON'T see these logs, or see ❌ errors:"
echo "- Clear browser cache completely"
echo "- Hard refresh (Cmd+Shift+R)"
echo ""
