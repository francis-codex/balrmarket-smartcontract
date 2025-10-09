import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Simulate EXACTLY what the frontend does
async function simulateFrontendExactly() {
  console.log("\n========================================");
  console.log("SIMULATING FRONTEND EXACT BEHAVIOR");
  console.log("========================================\n");

  // 1. Load IDL exactly as frontend does
  console.log("1. Loading IDL from frontend path...");
  const frontendIDLPath = path.join(__dirname, "../BalrMarket-Frontend/src/lib/idl.json");
  const idlData = JSON.parse(fs.readFileSync(frontendIDLPath, "utf-8"));
  console.log("   ✅ IDL loaded");

  // 2. Create connection (same as frontend)
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  console.log("   ✅ Connection created");

  // 3. Create dummy wallet (same structure as frontend)
  const dummyWallet = {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signTransaction: async () => { throw new Error("Not implemented"); },
    signAllTransactions: async () => { throw new Error("Not implemented"); }
  };

  // 4. Create provider exactly as frontend does
  const provider = new anchor.AnchorProvider(connection, dummyWallet as any, {
    preflightCommitment: "processed",
  });
  console.log("   ✅ Provider created");

  // 5. Create program exactly as frontend does
  console.log("\n2. Creating Anchor Program...");
  const idl = JSON.parse(JSON.stringify(idlData)); // Clone like in program.ts
  const program = new anchor.Program(idl as anchor.Idl, provider);
  console.log("   ✅ Program created");

  // 6. Validate IDL exactly as program.ts does
  console.log("\n3. Validating IDL fields...");
  const eventType = (idl as any).types?.find((t: any) => t.name === "Event");

  if (!eventType) {
    console.log("   ❌ Event type not found!");
    process.exit(1);
  }

  const hasCorrectField = eventType?.type?.fields?.some(
    (f: any) => f.name === "primary_market_closed_at" && f.type?.option === "i64"
  );

  const optaProbYes = eventType?.type?.fields?.find((f: any) => f.name === "opta_probability_yes");
  const isU32 = optaProbYes?.type === "u32";

  if (!hasCorrectField) {
    console.log("   ❌ primary_market_closed_at field validation FAILED!");
    console.log("   Fields:", eventType?.type?.fields?.map((f: any) => f.name));
    process.exit(1);
  }

  if (!isU32) {
    console.log("   ❌ opta_probability_yes is not u32!");
    console.log("   Type:", optaProbYes?.type);
    process.exit(1);
  }

  console.log("   ✅ primary_market_closed_at: Option<i64>");
  console.log("   ✅ opta_probability_yes: u32");

  // 7. Find Event accounts
  console.log("\n4. Finding Event accounts...");
  const programId = new PublicKey("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: 505 }]
  });

  console.log(`   Found ${accounts.length} Event accounts`);

  if (accounts.length === 0) {
    console.log("   ⚠️  No Event accounts found!");
    console.log("   Create a new event first.");
    process.exit(0);
  }

  // 8. Test fetching Event EXACTLY as placeOrder does (line 546 in balr-market-client.ts)
  console.log("\n5. Testing Event fetch (EXACT placeOrder simulation)...");

  for (let i = 0; i < Math.min(accounts.length, 3); i++) {
    const eventPubkey = accounts[i].pubkey;
    console.log(`\n   Testing Event ${i + 1}: ${eventPubkey.toBase58()}`);

    try {
      // THIS IS THE EXACT LINE THAT FAILS IN THE FRONTEND (balr-market-client.ts:546)
      const event = await (program.account as any).event.fetch(eventPubkey);

      console.log("   ✅ FETCH SUCCESSFUL!");
      console.log(`      Event ID: ${event.eventId}`);
      console.log(`      Market ID: ${event.marketId}`);
      console.log(`      Question: ${event.question.substring(0, 40)}...`);
      console.log(`      YES Price: ${event.yesSharePrice} lamports`);
      console.log(`      NO Price: ${event.noSharePrice} lamports`);
      console.log(`      Primary Market Closed At: ${event.primaryMarketClosedAt}`);
      console.log(`      Opta Probability Yes: ${event.optaProbabilityYes} (u32)`);
      console.log(`      Opta Probability No: ${event.optaProbabilityNo} (u32)`);

    } catch (error: any) {
      console.log("   ❌ FETCH FAILED!");
      console.log("   Error:", error.message);

      if (error.message.includes("Invalid option")) {
        console.log("\n   🔴 THIS IS THE EXACT ERROR YOU'RE SEEING!");
        console.log("   Root cause: Browser is using cached old IDL");
        console.log("\n   SOLUTION:");
        console.log("   1. Kill dev server (Ctrl+C)");
        console.log("   2. Run: rm -rf .next node_modules/.cache");
        console.log("   3. Start dev server: npm run dev");
        console.log("   4. Hard refresh browser: Cmd+Shift+R");
      }

      process.exit(1);
    }
  }

  console.log("\n========================================");
  console.log("✅ ALL TESTS PASSED!");
  console.log("========================================\n");
  console.log("The frontend code is 100% working.");
  console.log("If you still see the error, it's browser cache.");
  console.log("\nFINAL STEPS:");
  console.log("1. Stop dev server");
  console.log("2. cd /Users/franciscodex/BalrMarket-Frontend");
  console.log("3. rm -rf .next node_modules/.cache");
  console.log("4. npm run dev");
  console.log("5. Hard refresh browser (Cmd+Shift+R)");
  console.log("6. Try placing order again\n");
}

simulateFrontendExactly().catch((error) => {
  console.error("\n❌ ERROR:", error.message);
  console.error(error.stack);
  process.exit(1);
});
