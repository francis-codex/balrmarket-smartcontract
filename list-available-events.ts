import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Balrmarket } from "./target/types/balrmarket";

/**
 * List all available events that can be used for placing orders
 */
async function listAvailableEvents() {
  console.log("\n📋 LISTING ALL AVAILABLE EVENTS\n");
  console.log("=" .repeat(80));

  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const connection = provider.connection;

  console.log("\n🌐 Connected to:", connection.rpcEndpoint);
  console.log("📦 Program ID:", program.programId.toBase58());

  // Get all Event accounts
  // Event::INIT_SPACE from state/event.rs
  const EVENT_SIZE = 505; // Account size without discriminator
  const accounts = await connection.getProgramAccounts(program.programId, {
    filters: [{ dataSize: EVENT_SIZE }]
  });

  if (accounts.length === 0) {
    console.log("\n⚠️  No events found on-chain!");
    console.log("💡 Create events first using: anchor run test-order-placement\n");
    return;
  }

  console.log(`\n✅ Found ${accounts.length} events\n`);
  console.log("=" .repeat(80));

  // Group events by market_id
  const eventsByMarket: Record<string, any[]> = {};

  for (const account of accounts) {
    try {
      const event = await program.account.event.fetch(account.pubkey);
      const marketId = event.marketId;

      if (!eventsByMarket[marketId]) {
        eventsByMarket[marketId] = [];
      }

      eventsByMarket[marketId].push({
        pda: account.pubkey,
        eventId: event.eventId,
        question: event.question,
        status: event.status,
        yesPrice: event.yesSharePrice.toNumber(),
        noPrice: event.noSharePrice.toNumber(),
        maxSharesYes: event.maxSharesYes,
        maxSharesNo: event.maxSharesNo,
        mintedSharesYes: event.mintedSharesYes,
        mintedSharesNo: event.mintedSharesNo,
        primaryMarketClose: new Date(Number(event.primaryMarketClose) * 1000).toLocaleString(),
      });
    } catch (error) {
      // Skip accounts we can't decode
    }
  }

  // Display events grouped by market
  for (const [marketId, events] of Object.entries(eventsByMarket)) {
    console.log(`\n🏟️  MARKET: ${marketId}`);
    console.log("─".repeat(80));
    console.log(`   ${events.length} event(s)\n`);

    events.forEach((event, idx) => {
      const remainingYes = Number(event.maxSharesYes) - Number(event.mintedSharesYes);
      const remainingNo = Number(event.maxSharesNo) - Number(event.mintedSharesNo);
      const canTrade = remainingYes > 0 || remainingNo > 0;

      console.log(`   ${idx + 1}. Event ID: ${event.eventId}`);
      console.log(`      PDA: ${event.pda.toBase58()}`);
      console.log(`      Question: "${event.question}"`);
      console.log(`      Status: ${Object.keys(event.status)[0]}`);
      console.log(`      YES Price: ${(event.yesPrice / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      console.log(`      NO Price: ${(event.noPrice / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      console.log(`      Remaining Shares: YES=${remainingYes}, NO=${remainingNo}`);
      console.log(`      Primary Market Close: ${event.primaryMarketClose}`);
      console.log(`      ${canTrade ? '✅ AVAILABLE FOR TRADING' : '❌ NO SHARES LEFT'}`);
      console.log();
    });
  }

  console.log("=" .repeat(80));
  console.log("\n💡 To place an order, use the FULL event_id shown above");
  console.log("   Example: '21917_992661' NOT just '21917'\n");

  // Generate example code
  console.log("📝 Example Code:\n");
  const firstMarket = Object.keys(eventsByMarket)[0];
  const firstEvent = eventsByMarket[firstMarket][0];

  console.log("```typescript");
  console.log("// Derive Event PDA");
  console.log(`const [eventPDA] = PublicKey.findProgramAddressSync(`);
  console.log(`  [`);
  console.log(`    Buffer.from("event"),`);
  console.log(`    Buffer.from("${firstMarket}"),      // market_id`);
  console.log(`    Buffer.from("${firstEvent.eventId}") // FULL event_id`);
  console.log(`  ],`);
  console.log(`  program.programId`);
  console.log(`);`);
  console.log();
  console.log("// Place order");
  console.log("await program.methods");
  console.log("  .placeOrder(");
  console.log(`    new anchor.BN(Date.now()), // order_id`);
  console.log(`    "${firstEvent.eventId}",    // FULL event_id`);
  console.log("    { yes: {} },              // order_type");
  console.log("    new anchor.BN(10)         // quantity");
  console.log("  )");
  console.log("  .accounts({");
  console.log("    globalState: globalStatePDA,");
  console.log("    event: eventPDA,");
  console.log("    // ... other accounts");
  console.log("  })");
  console.log("  .rpc();");
  console.log("```\n");
}

listAvailableEvents()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
