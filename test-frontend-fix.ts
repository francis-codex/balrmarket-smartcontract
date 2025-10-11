import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

/**
 * Test script to verify the frontend fix will work
 * This simulates exactly what the frontend will do
 */

const PROGRAM_ID = new PublicKey("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");
const RPC_ENDPOINT = "https://api.devnet.solana.com";

async function testFrontendFix() {
  console.log("\n🧪 TESTING FRONTEND FIX\n");
  console.log("=" .repeat(80));

  try {
    // Step 1: Fetch events from smart contract (simulating smart-contract-events.ts)
    console.log("\n1️⃣  Fetching events from smart contract...");
    const connection = new Connection(RPC_ENDPOINT, "confirmed");

    // Load IDL (check if it's in frontend directory)
    const frontendIDLPath = path.join(__dirname, "../BalrMarket-Frontend/src/lib/idl.json");
    let idl;

    if (fs.existsSync(frontendIDLPath)) {
      console.log("   ✅ Loading IDL from frontend directory");
      idl = JSON.parse(fs.readFileSync(frontendIDLPath, "utf-8"));
    } else {
      console.log("   ✅ Loading IDL from target directory");
      idl = JSON.parse(fs.readFileSync(path.join(__dirname, "target/idl/balrmarket.json"), "utf-8"));
    }

    const provider = new anchor.AnchorProvider(
      connection,
      {} as any,
      { preflightCommitment: "confirmed" }
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);

    const EVENT_SIZE = 505;
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: EVENT_SIZE }],
    });

    console.log(`   ✅ Found ${accounts.length} event accounts on-chain`);

    if (accounts.length === 0) {
      console.log("\n   ❌ NO EVENTS FOUND!");
      console.log("   Create events first before testing.");
      return false;
    }

    // Step 2: Deserialize events
    console.log("\n2️⃣  Deserializing events...");
    const smartContractEvents: any[] = [];

    for (const account of accounts) {
      try {
        const event = await (program.account as any).event.fetch(account.pubkey);
        smartContractEvents.push({
          eventId: event.eventId,
          marketId: event.marketId,
          question: event.question,
          accountPubkey: account.pubkey.toBase58(),
        });
        console.log(`   ✅ ${event.eventId} - "${event.question}"`);
      } catch (error: any) {
        console.log(`   ⚠️  Failed to deserialize ${account.pubkey.toBase58()}: ${error.message}`);
      }
    }

    console.log(`\n   ✅ Successfully deserialized ${smartContractEvents.length} events`);

    // Step 3: Simulate backend API response
    console.log("\n3️⃣  Simulating backend API response...");
    const backendEvents = [
      {
        fixtureId: 21917,
        question: "will liverpool win",
        match: "chelsea vs liverpool",
      },
      {
        fixtureId: 21917,
        question: "test this shit",
        match: "chelsea vs liverpool",
      },
    ];

    console.log(`   ✅ Backend has ${backendEvents.length} events`);

    // Step 4: Match backend events with smart contract events (simulating dashboard logic)
    console.log("\n4️⃣  Matching backend events with smart contract events...");

    const scEventsByMarket = new Map<string, any[]>();
    smartContractEvents.forEach((scEvent) => {
      const events = scEventsByMarket.get(scEvent.marketId) || [];
      events.push(scEvent);
      scEventsByMarket.set(scEvent.marketId, events);
    });

    const mergedEvents = backendEvents.map((backendEvent) => {
      const marketId = String(backendEvent.fixtureId);
      const scEventsForMarket = scEventsByMarket.get(marketId) || [];

      // Find matching smart contract event by question
      let matchedScEvent = scEventsForMarket.find(
        (scEvent) =>
          scEvent.question.toLowerCase().trim() ===
          backendEvent.question.toLowerCase().trim()
      );

      // Fallback: use first event if no exact match
      if (!matchedScEvent && scEventsForMarket.length > 0) {
        matchedScEvent = scEventsForMarket[0];
        console.log(
          `   ⚠️  No exact match for "${backendEvent.question}", using first event: ${matchedScEvent.eventId}`
        );
      }

      if (matchedScEvent) {
        console.log(
          `   ✅ "${backendEvent.question}" → ${matchedScEvent.eventId}`
        );
      } else {
        console.log(
          `   ❌ No smart contract event found for "${backendEvent.question}" (market ${marketId})`
        );
      }

      return {
        ...backendEvent,
        eventId: matchedScEvent?.eventId,
      };
    });

    // Step 5: Verify all backend events have eventId
    console.log("\n5️⃣  Verifying merged events...");
    let allHaveEventId = true;

    mergedEvents.forEach((event) => {
      if (event.eventId) {
        console.log(`   ✅ "${event.question}" has eventId: ${event.eventId}`);
      } else {
        console.log(`   ❌ "${event.question}" missing eventId!`);
        allHaveEventId = false;
      }
    });

    // Step 6: Simulate placeOrder call
    console.log("\n6️⃣  Simulating placeOrder call...");

    const testEvent = mergedEvents.find(e => e.eventId);
    if (!testEvent) {
      console.log("   ❌ No events with eventId to test!");
      return false;
    }

    console.log(`   Testing with event: "${testEvent.question}"`);
    console.log(`   Event ID: ${testEvent.eventId}`);
    console.log(`   Fixture ID (fallback): ${testEvent.fixtureId}`);

    // This is what ViewMatches.tsx does:
    const eventIdToUse = testEvent.eventId || testEvent.fixtureId.toString();
    console.log(`   ✅ Will use eventId: ${eventIdToUse}`);

    // Verify this event exists on-chain
    const marketId = eventIdToUse.split("_")[0];
    const [eventPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        Buffer.from(marketId),
        Buffer.from(eventIdToUse),
      ],
      PROGRAM_ID
    );

    console.log(`   Derived PDA: ${eventPDA.toBase58()}`);

    const eventAccountInfo = await connection.getAccountInfo(eventPDA);
    if (eventAccountInfo) {
      console.log(`   ✅ Event account EXISTS on-chain!`);

      // Try to fetch it
      try {
        const eventData = await (program.account as any).event.fetch(eventPDA);
        console.log(`   ✅ Event data fetched successfully:`);
        console.log(`      Event ID: ${eventData.eventId}`);
        console.log(`      Market ID: ${eventData.marketId}`);
        console.log(`      Question: ${eventData.question}`);
      } catch (error: any) {
        console.log(`   ⚠️  Could fetch account but not deserialize: ${error.message}`);
      }
    } else {
      console.log(`   ❌ Event account DOES NOT EXIST on-chain!`);
      return false;
    }

    // Final verdict
    console.log("\n" + "=" .repeat(80));
    if (allHaveEventId && eventAccountInfo) {
      console.log("✅ ✅ ✅  FRONTEND FIX WILL WORK! ✅ ✅ ✅");
      console.log("\nNext steps:");
      console.log("1. cd /Users/franciscodex/BalrMarket-Frontend");
      console.log("2. npm run dev");
      console.log("3. Navigate to dashboard");
      console.log("4. Try placing an order");
      return true;
    } else {
      console.log("❌ ❌ ❌  FRONTEND FIX MAY HAVE ISSUES  ❌ ❌ ❌");
      if (!allHaveEventId) {
        console.log("\n⚠️  Some events couldn't be matched");
      }
      if (!eventAccountInfo) {
        console.log("\n⚠️  Event doesn't exist on-chain");
      }
      return false;
    }

  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    return false;
  }
}

testFrontendFix()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n❌ Unhandled error:", error);
    process.exit(1);
  });
