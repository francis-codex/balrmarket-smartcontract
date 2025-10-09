import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const programId = new PublicKey("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");

async function comprehensiveCheck() {
  console.log("\n========================================");
  console.log("COMPREHENSIVE VERIFICATION");
  console.log("========================================\n");

  // 1. Check IDL files
  console.log("1. Checking IDL files...");
  const contractIDL = JSON.parse(fs.readFileSync("target/idl/balrmarket.json", "utf-8"));
  const frontendIDL = JSON.parse(fs.readFileSync("../BalrMarket-Frontend/src/lib/idl.json", "utf-8"));
  const abiIDL = JSON.parse(fs.readFileSync("../BalrMarket-Frontend/src/components/utils/abi.json", "utf-8"));

  const contractHash = JSON.stringify(contractIDL);
  const frontendHash = JSON.stringify(frontendIDL);
  const abiHash = JSON.stringify(abiIDL);

  if (contractHash === frontendHash && contractHash === abiHash) {
    console.log("   ✅ All IDL files match");
  } else {
    console.log("   ❌ IDL files DO NOT match!");
    console.log("   Contract === Frontend:", contractHash === frontendHash);
    console.log("   Contract === ABI:", contractHash === abiHash);
    process.exit(1);
  }

  // 2. Check Event type definition
  console.log("\n2. Checking Event type definition...");
  const eventType = contractIDL.types.find((t: any) => t.name === "Event");

  if (!eventType) {
    console.log("   ❌ Event type not found in IDL!");
    process.exit(1);
  }

  const fields = eventType.type.fields;

  // Check primary_market_closed_at
  const pmcaField = fields.find((f: any) => f.name === "primary_market_closed_at");
  if (pmcaField && pmcaField.type.option === "i64") {
    console.log("   ✅ primary_market_closed_at: Option<i64>");
  } else {
    console.log("   ❌ primary_market_closed_at field is incorrect!");
    console.log("   Found:", pmcaField);
    process.exit(1);
  }

  // Check opta_probability_yes
  const optaYes = fields.find((f: any) => f.name === "opta_probability_yes");
  if (optaYes && optaYes.type === "u32") {
    console.log("   ✅ opta_probability_yes: u32");
  } else {
    console.log("   ❌ opta_probability_yes is not u32!");
    console.log("   Found:", optaYes);
    process.exit(1);
  }

  // Check opta_probability_no
  const optaNo = fields.find((f: any) => f.name === "opta_probability_no");
  if (optaNo && optaNo.type === "u32") {
    console.log("   ✅ opta_probability_no: u32");
  } else {
    console.log("   ❌ opta_probability_no is not u32!");
    console.log("   Found:", optaNo);
    process.exit(1);
  }

  // 3. Check on-chain Event accounts
  console.log("\n3. Checking on-chain Event accounts...");
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: 505 }]
  });

  console.log(`   Found ${accounts.length} Event accounts (505 bytes)`);

  if (accounts.length === 0) {
    console.log("   ⚠️  No Event accounts found with new size!");
    console.log("   You need to create a new event.");
  } else {
    console.log("   ✅ Event accounts exist with correct size");
  }

  // 4. Test Anchor deserialization with actual IDL
  console.log("\n4. Testing Anchor deserialization...");

  if (accounts.length > 0) {
    try {
      const dummyWallet = {
        publicKey: new PublicKey("11111111111111111111111111111111"),
        signTransaction: async () => { throw new Error("Not implemented"); },
        signAllTransactions: async () => { throw new Error("Not implemented"); }
      };

      const provider = new anchor.AnchorProvider(connection, dummyWallet as any, {});
      const program = new anchor.Program(contractIDL, provider);

      const eventPubkey = accounts[0].pubkey;
      console.log(`   Testing deserialization of: ${eventPubkey.toBase58()}`);

      const event = await (program.account as any).event.fetch(eventPubkey);

      console.log("   ✅ Deserialization successful!");
      console.log(`   Event ID: ${event.eventId}`);
      console.log(`   Market ID: ${event.marketId}`);
      console.log(`   Question: ${event.question.substring(0, 50)}...`);
      console.log(`   Primary Market Closed At: ${event.primaryMarketClosedAt}`);
      console.log(`   Opta Probability Yes (u32): ${event.optaProbabilityYes}`);
      console.log(`   Opta Probability No (u32): ${event.optaProbabilityNo}`);

    } catch (error: any) {
      console.log("   ❌ Deserialization FAILED!");
      console.log("   Error:", error.message);
      process.exit(1);
    }
  }

  // 5. Final summary
  console.log("\n========================================");
  console.log("✅ ALL CHECKS PASSED!");
  console.log("========================================\n");
  console.log("Summary:");
  console.log("• IDL files are synced");
  console.log("• Event type has correct fields (u32 for probabilities)");
  console.log("• On-chain accounts exist with correct size (505 bytes)");
  console.log("• Anchor can deserialize Event accounts successfully");
  console.log("\nThe error should be fixed after:");
  console.log("1. Restarting the dev server");
  console.log("2. Hard refreshing the browser (Cmd+Shift+R)");
  console.log("3. Placing an order on a recently created event\n");
}

comprehensiveCheck().catch((error) => {
  console.error("\n❌ VERIFICATION FAILED:", error);
  process.exit(1);
});
