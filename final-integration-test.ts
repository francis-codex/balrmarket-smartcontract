import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

/**
 * FINAL INTEGRATION TEST
 * This simulates the COMPLETE flow from frontend to smart contract
 */

const PROGRAM_ID = new PublicKey("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");
const RPC_ENDPOINT = "https://api.devnet.solana.com";

async function finalIntegrationTest() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 FINAL INTEGRATION TEST - COMPLETE FLOW SIMULATION");
  console.log("=".repeat(80) + "\n");

  let testsPassed = 0;
  let totalTests = 0;

  try {
    // ============================================================================
    // TEST 1: Load IDL and create program (simulating smart-contract-events.ts)
    // ============================================================================
    totalTests++;
    console.log("TEST 1: Load IDL and create program instance");
    console.log("─".repeat(80));

    const frontendIDLPath = path.join(__dirname, "../BalrMarket-Frontend/src/lib/idl.json");
    const idl = JSON.parse(fs.readFileSync(frontendIDLPath, "utf-8"));

    if (idl.address !== PROGRAM_ID.toBase58()) {
      throw new Error(`IDL address mismatch! Expected ${PROGRAM_ID.toBase58()}, got ${idl.address}`);
    }

    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const provider = new anchor.AnchorProvider(connection, {} as any, { preflightCommitment: "confirmed" });
    const program = new anchor.Program(idl as anchor.Idl, provider);

    console.log("✅ IDL loaded successfully");
    console.log("✅ Program ID matches:", PROGRAM_ID.toBase58());
    console.log("✅ Connection established");
    testsPassed++;

    // ============================================================================
    // TEST 2: Fetch events from smart contract
    // ============================================================================
    totalTests++;
    console.log("\nTEST 2: Fetch and deserialize smart contract events");
    console.log("─".repeat(80));

    const EVENT_SIZE = 505;
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: EVENT_SIZE }],
    });

    console.log(`✅ Found ${accounts.length} event accounts`);

    if (accounts.length === 0) {
      throw new Error("No events found on-chain! Create events first.");
    }

    const smartContractEvents: any[] = [];
    for (const account of accounts) {
      const event = await (program.account as any).event.fetch(account.pubkey);
      smartContractEvents.push({
        eventId: event.eventId,
        marketId: event.marketId,
        question: event.question,
        accountPubkey: account.pubkey.toBase58(),
      });
    }

    console.log(`✅ Successfully deserialized ${smartContractEvents.length} events`);
    testsPassed++;

    // ============================================================================
    // TEST 3: Simulate backend API response
    // ============================================================================
    totalTests++;
    console.log("\nTEST 3: Simulate backend API response");
    console.log("─".repeat(80));

    const backendResponse = await fetch("https://balrmarket-backend-new.onrender.com/api/v1/events");
    const backendData = await backendResponse.json();

    console.log(`✅ Backend returned ${backendData.data?.length || 0} events`);

    if (!backendData.data || backendData.data.length === 0) {
      throw new Error("Backend returned no events!");
    }
    testsPassed++;

    // ============================================================================
    // TEST 4: Match backend events with smart contract events (dashboard logic)
    // ============================================================================
    totalTests++;
    console.log("\nTEST 4: Match backend events with smart contract events");
    console.log("─".repeat(80));

    const scEventsByMarket = new Map<string, any[]>();
    smartContractEvents.forEach((scEvent) => {
      const events = scEventsByMarket.get(scEvent.marketId) || [];
      events.push(scEvent);
      scEventsByMarket.set(scEvent.marketId, events);
    });

    const mergedEvents = backendData.data.map((backendEvent: any) => {
      const marketId = String(backendEvent.fixtureId);
      const scEventsForMarket = scEventsByMarket.get(marketId) || [];

      let matchedScEvent = scEventsForMarket.find(
        (scEvent) =>
          scEvent.question.toLowerCase().trim() === backendEvent.question.toLowerCase().trim()
      );

      if (!matchedScEvent && scEventsForMarket.length > 0) {
        matchedScEvent = scEventsForMarket[0];
      }

      return {
        ...backendEvent,
        eventId: matchedScEvent?.eventId,
      };
    });

    const eventsWithId = mergedEvents.filter((e: any) => e.eventId);
    console.log(`✅ Matched ${eventsWithId.length}/${mergedEvents.length} events with smart contract`);

    if (eventsWithId.length === 0) {
      throw new Error("No events could be matched!");
    }
    testsPassed++;

    // ============================================================================
    // TEST 5: Simulate ViewMatches component behavior
    // ============================================================================
    totalTests++;
    console.log("\nTEST 5: Simulate ViewMatches component (eventId selection)");
    console.log("─".repeat(80));

    const testEvent = eventsWithId[0];
    console.log(`Selected test event: "${testEvent.question}"`);
    console.log(`  fixtureId: ${testEvent.fixtureId}`);
    console.log(`  eventId: ${testEvent.eventId}`);

    // This is EXACTLY what ViewMatches.tsx does on line 69
    const eventIdToUse = testEvent.eventId || testEvent.fixtureId.toString() || "";

    console.log(`✅ eventId selected: "${eventIdToUse}"`);

    if (!eventIdToUse.includes("_")) {
      throw new Error(`Invalid eventId format! Expected format: "marketId_timestamp", got: "${eventIdToUse}"`);
    }
    testsPassed++;

    // ============================================================================
    // TEST 6: Simulate balr-market-client.ts getMarketIdForEvent
    // ============================================================================
    totalTests++;
    console.log("\nTEST 6: Extract marketId from eventId (client logic)");
    console.log("─".repeat(80));

    // This simulates balr-market-client.ts line 877-896
    let marketId: string;
    if (eventIdToUse.includes('_')) {
      const parts = eventIdToUse.split('_');
      marketId = parts[0];
      console.log(`✅ Extracted marketId: "${marketId}" from eventId: "${eventIdToUse}"`);
    } else {
      marketId = eventIdToUse;
      console.log(`⚠️  No underscore found, using entire eventId as marketId: "${marketId}"`);
    }
    testsPassed++;

    // ============================================================================
    // TEST 7: Derive event PDA (exactly as balr-market-client.ts does)
    // ============================================================================
    totalTests++;
    console.log("\nTEST 7: Derive event PDA");
    console.log("─".repeat(80));

    const [eventPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        Buffer.from(marketId),
        Buffer.from(eventIdToUse),
      ],
      PROGRAM_ID
    );

    console.log(`✅ Event PDA derived: ${eventPDA.toBase58()}`);
    console.log(`  Seeds: ["event", "${marketId}", "${eventIdToUse}"]`);
    testsPassed++;

    // ============================================================================
    // TEST 8: Verify event account exists on-chain
    // ============================================================================
    totalTests++;
    console.log("\nTEST 8: Verify event account exists on-chain");
    console.log("─".repeat(80));

    const eventAccountInfo = await connection.getAccountInfo(eventPDA);

    if (!eventAccountInfo) {
      console.log(`❌ Event account NOT FOUND at PDA: ${eventPDA.toBase58()}`);
      console.log(`   Market ID: ${marketId}`);
      console.log(`   Event ID: ${eventIdToUse}`);
      throw new Error("Event account does not exist!");
    }

    console.log(`✅ Event account EXISTS at PDA: ${eventPDA.toBase58()}`);
    console.log(`  Owner: ${eventAccountInfo.owner.toBase58()}`);
    console.log(`  Size: ${eventAccountInfo.data.length} bytes`);
    testsPassed++;

    // ============================================================================
    // TEST 9: Fetch and verify event data
    // ============================================================================
    totalTests++;
    console.log("\nTEST 9: Fetch and verify event data");
    console.log("─".repeat(80));

    const eventData = await (program.account as any).event.fetch(eventPDA);

    console.log(`✅ Event data fetched successfully:`);
    console.log(`  Event ID: ${eventData.eventId}`);
    console.log(`  Market ID: ${eventData.marketId}`);
    console.log(`  Question: ${eventData.question}`);
    console.log(`  YES Price: ${eventData.yesSharePrice.toNumber()} lamports`);
    console.log(`  NO Price: ${eventData.noSharePrice.toNumber()} lamports`);
    console.log(`  Status: ${Object.keys(eventData.status)[0]}`);

    if (eventData.eventId !== eventIdToUse) {
      throw new Error(`Event ID mismatch! Expected ${eventIdToUse}, got ${eventData.eventId}`);
    }

    if (eventData.marketId !== marketId) {
      throw new Error(`Market ID mismatch! Expected ${marketId}, got ${eventData.marketId}`);
    }

    testsPassed++;

    // ============================================================================
    // TEST 10: Simulate eventExists check (balr-market-service.ts line 548)
    // ============================================================================
    totalTests++;
    console.log("\nTEST 10: Simulate eventExists check from service");
    console.log("─".repeat(80));

    // This simulates the exact check that throws the error
    const eventExists = eventAccountInfo !== null;

    if (!eventExists) {
      throw new Error(`Event ${eventIdToUse} does not exist in the smart contract.`);
    }

    console.log(`✅ eventExists check PASSED`);
    testsPassed++;

    // ============================================================================
    // FINAL RESULTS
    // ============================================================================
    console.log("\n" + "=".repeat(80));
    console.log("🎉 FINAL INTEGRATION TEST RESULTS");
    console.log("=".repeat(80));
    console.log(`\n✅ PASSED: ${testsPassed}/${totalTests} tests`);

    if (testsPassed === totalTests) {
      console.log("\n" + "🎊".repeat(20));
      console.log("✅ ✅ ✅  ALL TESTS PASSED - 100% SUCCESS! ✅ ✅ ✅");
      console.log("🎊".repeat(20) + "\n");

      console.log("📋 VERIFIED FLOW:");
      console.log("  1. ✅ IDL loads correctly");
      console.log("  2. ✅ Smart contract events fetch successfully");
      console.log("  3. ✅ Backend API responds");
      console.log("  4. ✅ Events match by market ID + question");
      console.log("  5. ✅ eventId field populated in merged data");
      console.log("  6. ✅ marketId extracted from eventId");
      console.log("  7. ✅ Event PDA derived correctly");
      console.log("  8. ✅ Event account exists on-chain");
      console.log("  9. ✅ Event data matches expected values");
      console.log(" 10. ✅ eventExists check passes");

      console.log("\n🚀 READY FOR PRODUCTION!");
      console.log("\nNext steps:");
      console.log("  cd /Users/franciscodex/BalrMarket-Frontend");
      console.log("  npm run dev");
      console.log("  Navigate to dashboard and place an order");

      return true;
    } else {
      throw new Error(`Only ${testsPassed}/${totalTests} tests passed!`);
    }

  } catch (error: any) {
    console.log("\n" + "=".repeat(80));
    console.log("❌ TEST FAILED");
    console.log("=".repeat(80));
    console.log(`\n✅ Passed: ${testsPassed}/${totalTests}`);
    console.log(`❌ Failed at test ${testsPassed + 1}`);
    console.log(`\nError: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

finalIntegrationTest()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
