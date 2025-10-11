import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { Balrmarket } from "./target/types/balrmarket";

/**
 * Diagnostic script to investigate event 21917 error
 */
async function diagnoseEvent21917() {
  console.log("\n🔍 DIAGNOSING EVENT 21917 ERROR\n");
  console.log("=" .repeat(60));

  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const connection = provider.connection;

  const programId = program.programId;
  console.log("\n📋 Program ID:", programId.toBase58());
  console.log("🌐 Cluster:", provider.connection.rpcEndpoint);

  // 1. Check all Event accounts on-chain
  console.log("\n" + "=".repeat(60));
  console.log("1️⃣  FINDING ALL EVENT ACCOUNTS ON-CHAIN");
  console.log("=".repeat(60));

  try {
    // Event account size is defined in event.rs
    const EVENT_SIZE = 505; // From INIT_SPACE calculation

    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { dataSize: EVENT_SIZE } // Filter for Event accounts
      ]
    });

    console.log(`\n✅ Found ${accounts.length} Event accounts\n`);

    if (accounts.length === 0) {
      console.log("⚠️  No events exist on-chain yet!");
      console.log("\n💡 SOLUTION: Create an event first using create_event instruction");
      return;
    }

    // 2. Decode and display all events
    console.log("📊 Event Details:\n");
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      console.log(`\n--- Event ${i + 1} ---`);
      console.log(`PDA: ${account.pubkey.toBase58()}`);

      try {
        const event = await program.account.event.fetch(account.pubkey);
        console.log(`Event ID: ${event.eventId}`);
        console.log(`Market ID: ${event.marketId}`);
        console.log(`Question: ${event.question}`);
        console.log(`Status: ${Object.keys(event.status)[0]}`);
        console.log(`YES Price: ${event.yesSharePrice.toNumber()} lamports`);
        console.log(`NO Price: ${event.noSharePrice.toNumber()} lamports`);

        // Check if this could be event 21917
        if (event.eventId.includes("21917") || event.eventId === "21917") {
          console.log("✅ *** THIS IS EVENT 21917! ***");
        }
      } catch (error: any) {
        console.log(`❌ Failed to decode: ${error.message}`);
      }
    }

    // 3. Try to derive PDA for event "21917"
    console.log("\n" + "=".repeat(60));
    console.log("2️⃣  ATTEMPTING TO DERIVE PDA FOR EVENT '21917'");
    console.log("=".repeat(60));

    // Get all markets first
    // Market::INIT_SPACE = 4 + 50 + 4 + 100 + 4 + 100 + 8 + 8 + 32 + 1 + 1 + 1 = 313
    const MARKET_SIZE = 8 + 313; // 8 byte discriminator + INIT_SPACE
    const marketAccounts = await connection.getProgramAccounts(programId, {
      filters: [
        { dataSize: MARKET_SIZE }
      ]
    });

    console.log(`\nFound ${marketAccounts.length} market accounts`);

    if (marketAccounts.length === 0) {
      console.log("\n⚠️  No markets exist!");
      console.log("💡 SOLUTION: Create a market first");
      return;
    }

    // Try to derive event PDA with each market
    let foundMatch = false;
    for (const marketAccount of marketAccounts) {
      try {
        const market = await program.account.market.fetch(marketAccount.pubkey);
        const marketId = market.marketId;

        // Derive event PDA: seeds = [b"event", market_id, event_id]
        const [eventPDA, bump] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("event"),
            Buffer.from(marketId),
            Buffer.from("21917")
          ],
          programId
        );

        console.log(`\n🔍 Checking Market: ${marketId}`);
        console.log(`   Expected PDA: ${eventPDA.toBase58()}`);

        // Check if this PDA exists
        const accountInfo = await connection.getAccountInfo(eventPDA);

        if (accountInfo) {
          console.log("   ✅ ACCOUNT EXISTS!");
          foundMatch = true;

          try {
            const event = await program.account.event.fetch(eventPDA);
            console.log(`   Event ID: ${event.eventId}`);
            console.log(`   Market ID: ${event.marketId}`);
            console.log(`   Status: ${Object.keys(event.status)[0]}`);
          } catch (error: any) {
            console.log(`   ❌ Failed to decode: ${error.message}`);
          }
        } else {
          console.log("   ❌ Account does NOT exist");
        }
      } catch (error: any) {
        // Skip if market fetch fails
      }
    }

    // 4. Provide diagnosis
    console.log("\n" + "=".repeat(60));
    console.log("3️⃣  DIAGNOSIS & SOLUTION");
    console.log("=".repeat(60));

    if (!foundMatch) {
      console.log("\n🔴 ROOT CAUSE:");
      console.log("   Event with ID '21917' does NOT exist on-chain!");

      console.log("\n💡 POSSIBLE CAUSES:");
      console.log("   1. Event was never created");
      console.log("   2. Event ID mismatch (check if it's '21917' vs 'event_21917')");
      console.log("   3. Wrong market_id being used for PDA derivation");
      console.log("   4. Connected to wrong Solana cluster (devnet vs mainnet)");

      console.log("\n✅ SOLUTIONS:");
      console.log("   Option A: Create the event first:");
      console.log("      anchor run test-order-placement");
      console.log("   ");
      console.log("   Option B: Use an existing event ID:");
      console.log("      Available events:");
      accounts.slice(0, 3).forEach((acc, idx) => {
        console.log(`      - Check event ${idx + 1} above for its event_id`);
      });
      console.log("   ");
      console.log("   Option C: Check the frontend is using correct event_id format");
    } else {
      console.log("\n✅ Event 21917 EXISTS!");
      console.log("   The error might be due to:");
      console.log("   1. Incorrect market_id in PDA derivation");
      console.log("   2. Wrong event_id format (check spaces, case sensitivity)");
      console.log("   3. Account deserialization issues");
    }

  } catch (error: any) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
  }

  console.log("\n" + "=".repeat(60));
  console.log("END OF DIAGNOSIS");
  console.log("=".repeat(60) + "\n");
}

diagnoseEvent21917()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Diagnostic failed:", error);
    process.exit(1);
  });
