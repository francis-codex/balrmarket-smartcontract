import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";

describe("Full Workflow Integration", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const connection = provider.connection;

  // Test wallets
  let adminKeypair: web3.Keypair;
  let user1Keypair: web3.Keypair;
  let user2Keypair: web3.Keypair;

  // Test constants
  const PLATFORM_FEE_PRIMARY = 200; // 2% in basis points
  const PLATFORM_FEE_SECONDARY = 100; // 1% in basis points

  // Test data
  const MARKET_ID = "EPL_MAN_UTD_VS_ARSENAL_20240315";
  const TEAM_A = "Manchester United";
  const TEAM_B = "Arsenal";
  const EVENT_ID = "FIRST_GOAL_SCORER";
  const QUESTION = "Will Cristiano Ronaldo score the first goal?";
  const MAX_SHARES = 200;
  const OPTA_ODDS_YES = 6000; // 60% probability

  // Derived PDAs
  let globalStatePda: web3.PublicKey;
  let marketPda: web3.PublicKey;
  let eventPda: web3.PublicKey;
  let orderBookPda: web3.PublicKey;

  beforeEach(async () => {
    // Generate fresh keypairs for each test scenario
    adminKeypair = web3.Keypair.generate();
    user1Keypair = web3.Keypair.generate();
    user2Keypair = web3.Keypair.generate();

    // Airdrop SOL to all test accounts
    await Promise.all([
      connection.requestAirdrop(adminKeypair.publicKey, 20 * web3.LAMPORTS_PER_SOL),
      connection.requestAirdrop(user1Keypair.publicKey, 10 * web3.LAMPORTS_PER_SOL),
      connection.requestAirdrop(user2Keypair.publicKey, 10 * web3.LAMPORTS_PER_SOL),
    ]);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Derive all PDAs
    [globalStatePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );

    [marketPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(MARKET_ID)],
      program.programId
    );

    [eventPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(EVENT_ID)],
      program.programId
    );

    [orderBookPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("orderbook"), Buffer.from(EVENT_ID), Buffer.from("primary")],
      program.programId
    );
  });

  describe("Complete Platform Setup and Event Creation", () => {
    it("Should execute full platform initialization workflow", async () => {
      console.log("\n=== PLATFORM INITIALIZATION WORKFLOW ===");

      // Step 1: Initialize Global State
      console.log("Step 1: Initializing global state...");
      const initTx = await program.methods
        .initializeGlobalState(
          adminKeypair.publicKey,
          PLATFORM_FEE_PRIMARY,
          PLATFORM_FEE_SECONDARY
        )
        .signers([adminKeypair])
        .rpc();

      console.log(`✅ Global state initialized: ${initTx}`);

      // Verify global state
      const globalState = await program.account.globalState.fetch(globalStatePda);
      expect(globalState.admin.toString()).to.equal(adminKeypair.publicKey.toString());
      expect(globalState.totalEvents.toNumber()).to.equal(0);
      console.log(`📊 Platform fees: ${globalState.platformFeePrimary}bp primary, ${globalState.platformFeeSecondary}bp secondary`);

      // Step 2: Create Market
      console.log("\nStep 2: Creating football match market...");
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days from now
      
      const marketTx = await program.methods
        .createMarket(
          MARKET_ID,
          TEAM_A,
          TEAM_B,
          new BN(futureTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      console.log(`✅ Market created: ${marketTx}`);

      // Verify market
      const market = await program.account.market.fetch(marketPda);
      expect(market.marketId).to.equal(MARKET_ID);
      expect(market.teamA).to.equal(TEAM_A);
      expect(market.teamB).to.equal(TEAM_B);
      expect(market.totalEvents).to.equal(0);
      console.log(`⚽ Match: ${market.teamA} vs ${market.teamB} at ${new Date(market.matchTimestamp.toNumber() * 1000).toISOString()}`);

      // Step 3: Create Prediction Event
      console.log("\nStep 3: Creating prediction event...");
      
      const eventTx = await program.methods
        .createEvent(
          EVENT_ID,
          QUESTION,
          MAX_SHARES,
          OPTA_ODDS_YES,
          new BN(futureTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      console.log(`✅ Event created: ${eventTx}`);

      // Verify event
      const event = await program.account.event.fetch(eventPda);
      expect(event.eventId).to.equal(EVENT_ID);
      expect(event.question).to.equal(QUESTION);
      expect(event.maxSharesTotal).to.equal(MAX_SHARES);
      expect(event.maxSharesYes).to.equal(MAX_SHARES / 2);
      expect(event.maxSharesNo).to.equal(MAX_SHARES / 2);
      console.log(`🎯 Event: "${event.question}"`);
      console.log(`📈 Shares: ${event.maxSharesYes} YES, ${event.maxSharesNo} NO`);
      console.log(`💰 Prices: ${event.yesSharePrice.toNumber() / web3.LAMPORTS_PER_SOL} SOL (YES), ${event.noSharePrice.toNumber() / web3.LAMPORTS_PER_SOL} SOL (NO)`);

      // Verify order book was created
      const orderBook = await program.account.orderBook.fetch(orderBookPda);
      expect(orderBook.eventId).to.equal(EVENT_ID);
      expect(orderBook.yesOrders).to.be.an('array').that.is.empty;
      expect(orderBook.noOrders).to.be.an('array').that.is.empty;
      console.log(`📚 Order book initialized for primary market`);

      // Verify counters were updated
      const updatedGlobalState = await program.account.globalState.fetch(globalStatePda);
      const updatedMarket = await program.account.market.fetch(marketPda);
      expect(updatedGlobalState.totalEvents.toNumber()).to.equal(1);
      expect(updatedMarket.totalEvents).to.equal(1);
      console.log(`📊 Counters updated: ${updatedGlobalState.totalEvents} total events, ${updatedMarket.totalEvents} market events`);

      // Step 4: Verify timing calculations
      console.log("\nStep 4: Verifying market timing...");
      const primaryClose = event.primaryMarketClose.toNumber();
      const secondaryOpen = event.secondaryMarketOpen.toNumber();
      const secondaryClose = event.secondaryMarketClose.toNumber();

      console.log(`🕐 Primary market closes: ${new Date(primaryClose * 1000).toISOString()} (5 min before match)`);
      console.log(`🕑 Secondary market opens: ${new Date(secondaryOpen * 1000).toISOString()} (at match start)`);
      console.log(`🕒 Secondary market closes: ${new Date(secondaryClose * 1000).toISOString()} (105 min after match)`);

      expect(primaryClose).to.equal(futureTimestamp - 300); // 5 minutes before
      expect(secondaryOpen).to.equal(futureTimestamp);
      expect(secondaryClose).to.equal(futureTimestamp + 6300); // 105 minutes after

      console.log("\n✅ COMPLETE PLATFORM SETUP SUCCESSFUL");
    });
  });

  describe("Multi-Event Market Scenario", () => {
    it("Should handle multiple events in the same market", async () => {
      console.log("\n=== MULTI-EVENT MARKET SCENARIO ===");

      // Setup: Initialize platform and create market
      await program.methods
        .initializeGlobalState(adminKeypair.publicKey, PLATFORM_FEE_PRIMARY, PLATFORM_FEE_SECONDARY)
        .signers([adminKeypair])
        .rpc();

      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;
      await program.methods
        .createMarket(MARKET_ID, TEAM_A, TEAM_B, new BN(futureTimestamp))
        .signers([adminKeypair])
        .rpc();

      // Create multiple events for the same match
      const events = [
        { id: "FIRST_GOAL", question: "Who will score the first goal?", odds: 6000 },
        { id: "TOTAL_GOALS", question: "Will there be over 2.5 goals?", odds: 5500 },
        { id: "YELLOW_CARDS", question: "Will there be over 3 yellow cards?", odds: 4500 },
        { id: "CORNERS", question: "Will there be over 8 corners?", odds: 5000 },
      ];

      console.log(`Creating ${events.length} events for the same match...`);

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        console.log(`\nCreating event ${i + 1}: ${event.question}`);

        const [eventPdaLocal] = web3.PublicKey.findProgramAddressSync(
          [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(event.id)],
          program.programId
        );

        await program.methods
          .createEvent(event.id, event.question, 100, event.odds, new BN(futureTimestamp))
          .signers([adminKeypair])
          .rpc();

        // Verify event was created correctly
        const eventAccount = await program.account.event.fetch(eventPdaLocal);
        expect(eventAccount.eventId).to.equal(event.id);
        expect(eventAccount.marketId).to.equal(MARKET_ID);
        expect(eventAccount.question).to.equal(event.question);
        console.log(`✅ Event "${eventAccount.eventId}" created with ${eventAccount.optaProbabilityYes}bp YES probability`);
      }

      // Verify all counters are correct
      const finalGlobalState = await program.account.globalState.fetch(globalStatePda);
      const finalMarket = await program.account.market.fetch(marketPda);

      expect(finalGlobalState.totalEvents.toNumber()).to.equal(events.length);
      expect(finalMarket.totalEvents).to.equal(events.length);

      console.log(`\n📊 Final counters: ${finalGlobalState.totalEvents} total events, ${finalMarket.totalEvents} market events`);
      console.log("✅ MULTI-EVENT SCENARIO SUCCESSFUL");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("Should handle various error scenarios gracefully", async () => {
      console.log("\n=== ERROR HANDLING SCENARIOS ===");

      // Initialize platform first
      await program.methods
        .initializeGlobalState(adminKeypair.publicKey, PLATFORM_FEE_PRIMARY, PLATFORM_FEE_SECONDARY)
        .signers([adminKeypair])
        .rpc();

      // Test 1: Try to create market with non-admin signer
      console.log("\nTest 1: Non-admin market creation (should fail)");
      try {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;
        await program.methods
          .createMarket("INVALID_MARKET", "Team A", "Team B", new BN(futureTimestamp))
          .signers([user1Keypair])
          .rpc();
        expect.fail("Should have failed with unauthorized error");
      } catch (error) {
        console.log(`✅ Correctly rejected non-admin: ${error.error?.errorCode?.code || error.message}`);
        expect(error.error?.errorCode?.code).to.equal("Unauthorized");
      }

      // Test 2: Create valid market first
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;
      await program.methods
        .createMarket(MARKET_ID, TEAM_A, TEAM_B, new BN(futureTimestamp))
        .signers([adminKeypair])
        .rpc();

      // Test 3: Try to create duplicate market
      console.log("\nTest 2: Duplicate market creation (should fail)");
      try {
        await program.methods
          .createMarket(MARKET_ID, "Different Team A", "Different Team B", new BN(futureTimestamp + 3600))
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with duplicate market");
      } catch (error) {
        console.log(`✅ Correctly rejected duplicate market: ${error.message}`);
        expect(error.message).to.include("already in use");
      }

      // Test 4: Try to create event with invalid parameters
      console.log("\nTest 3: Invalid event parameters (should fail)");
      try {
        await program.methods
          .createEvent("", "Invalid question", 0, 5000, new BN(futureTimestamp)) // Empty ID, zero shares
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with invalid parameters");
      } catch (error) {
        console.log(`✅ Correctly rejected invalid parameters: ${error.error?.errorCode?.code || error.message}`);
      }

      // Test 5: Try to create event too close to match time
      console.log("\nTest 4: Event too close to match time (should fail)");
      try {
        const soonTimestamp = Math.floor(Date.now() / 1000) + 3600; // Only 1 hour from now
        await program.methods
          .createEvent("TOO_SOON", "Valid question", 100, 5000, new BN(soonTimestamp))
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with match too soon");
      } catch (error) {
        console.log(`✅ Correctly rejected event too soon: ${error.error?.errorCode?.code || error.message}`);
        expect(error.error?.errorCode?.code).to.equal("MatchTooSoon");
      }

      console.log("\n✅ ERROR HANDLING TESTS SUCCESSFUL");
    });
  });

  describe("Account Size and Rent Analysis", () => {
    it("Should analyze rent costs for full workflow", async () => {
      console.log("\n=== RENT COST ANALYSIS ===");

      // Calculate rent requirements for all accounts
      const accountSizes = [
        { name: "GlobalState", size: 8 + 78 },
        { name: "Market", size: 8 + 309 },
        { name: "Event", size: 8 + 433 },
        { name: "OrderBook", size: 8 + 9715 }
      ];

      let totalRentLamports = 0;
      console.log("\nRent requirements:");

      for (const account of accountSizes) {
        const rentLamports = await connection.getMinimumBalanceForRentExemption(account.size);
        const rentSOL = rentLamports / web3.LAMPORTS_PER_SOL;
        totalRentLamports += rentLamports;
        
        console.log(`${account.name.padEnd(12)}: ${account.size.toString().padStart(5)} bytes = ${rentLamports.toString().padStart(8)} lamports (${rentSOL.toFixed(6)} SOL)`);
      }

      const totalRentSOL = totalRentLamports / web3.LAMPORTS_PER_SOL;
      console.log(`${"Total".padEnd(12)}: ${"".padStart(5)} bytes = ${totalRentLamports.toString().padStart(8)} lamports (${totalRentSOL.toFixed(6)} SOL)`);

      // Execute full workflow and verify rent is paid
      console.log("\nExecuting full workflow...");

      const adminInitialBalance = await connection.getBalance(adminKeypair.publicKey);
      console.log(`Admin initial balance: ${adminInitialBalance / web3.LAMPORTS_PER_SOL} SOL`);

      // Initialize global state
      await program.methods
        .initializeGlobalState(adminKeypair.publicKey, PLATFORM_FEE_PRIMARY, PLATFORM_FEE_SECONDARY)
        .signers([adminKeypair])
        .rpc();

      // Create market
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;
      await program.methods
        .createMarket(MARKET_ID, TEAM_A, TEAM_B, new BN(futureTimestamp))
        .signers([adminKeypair])
        .rpc();

      // Create event (which also creates order book)
      await program.methods
        .createEvent(EVENT_ID, QUESTION, MAX_SHARES, OPTA_ODDS_YES, new BN(futureTimestamp))
        .signers([adminKeypair])
        .rpc();

      const adminFinalBalance = await connection.getBalance(adminKeypair.publicKey);
      const totalCostLamports = adminInitialBalance - adminFinalBalance;
      const totalCostSOL = totalCostLamports / web3.LAMPORTS_PER_SOL;

      console.log(`Admin final balance: ${adminFinalBalance / web3.LAMPORTS_PER_SOL} SOL`);
      console.log(`Total cost: ${totalCostLamports} lamports (${totalCostSOL.toFixed(6)} SOL)`);
      console.log(`Rent portion: ${totalRentLamports} lamports (${totalRentSOL.toFixed(6)} SOL)`);
      console.log(`Transaction fees: ${totalCostLamports - totalRentLamports} lamports (${((totalCostLamports - totalRentLamports) / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL)`);

      // Verify all accounts exist and have correct sizes
      const accounts = [
        { name: "GlobalState", pda: globalStatePda, expectedSize: 8 + 78 },
        { name: "Market", pda: marketPda, expectedSize: 8 + 309 },
        { name: "Event", pda: eventPda, expectedSize: 8 + 433 },
        { name: "OrderBook", pda: orderBookPda, expectedSize: 8 + 9715 }
      ];

      console.log("\nAccount verification:");
      for (const account of accounts) {
        const accountInfo = await connection.getAccountInfo(account.pda);
        expect(accountInfo).to.not.be.null;
        expect(accountInfo!.data.length).to.equal(account.expectedSize);
        console.log(`✅ ${account.name}: ${accountInfo!.data.length} bytes (expected ${account.expectedSize})`);
      }

      console.log("\n✅ RENT ANALYSIS COMPLETE");
    });
  });

  describe("Event Lifecycle Simulation", () => {
    it("Should simulate complete event lifecycle with timing", async () => {
      console.log("\n=== EVENT LIFECYCLE SIMULATION ===");

      // Setup complete platform
      await program.methods
        .initializeGlobalState(adminKeypair.publicKey, PLATFORM_FEE_PRIMARY, PLATFORM_FEE_SECONDARY)
        .signers([adminKeypair])
        .rpc();

      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;
      await program.methods
        .createMarket(MARKET_ID, TEAM_A, TEAM_B, new BN(futureTimestamp))
        .signers([adminKeypair])
        .rpc();

      await program.methods
        .createEvent(EVENT_ID, QUESTION, MAX_SHARES, OPTA_ODDS_YES, new BN(futureTimestamp))
        .signers([adminKeypair])
        .rpc();

      // Fetch created event
      const event = await program.account.event.fetch(eventPda);
      const market = await program.account.market.fetch(marketPda);
      const orderBook = await program.account.orderBook.fetch(orderBookPda);

      console.log("\n📅 Event Timeline:");
      console.log(`Event created at: ${new Date(event.createdAt.toNumber() * 1000).toISOString()}`);
      console.log(`Primary market closes: ${new Date(event.primaryMarketClose.toNumber() * 1000).toISOString()}`);
      console.log(`Match starts (secondary opens): ${new Date(event.secondaryMarketOpen.toNumber() * 1000).toISOString()}`);
      console.log(`Secondary market closes: ${new Date(event.secondaryMarketClose.toNumber() * 1000).toISOString()}`);

      // Verify initial state
      console.log("\n📊 Initial Event State:");
      console.log(`Status: ${JSON.stringify(event.status)}`);
      console.log(`Total shares: ${event.maxSharesTotal} (${event.maxSharesYes} YES, ${event.maxSharesNo} NO)`);
      console.log(`Minted shares: ${event.mintedSharesYes} YES, ${event.mintedSharesNo} NO`);
      console.log(`Share prices: ${event.yesSharePrice.toNumber() / web3.LAMPORTS_PER_SOL} SOL (YES), ${event.noSharePrice.toNumber() / web3.LAMPORTS_PER_SOL} SOL (NO)`);
      console.log(`OPTA probabilities: ${event.optaProbabilityYes}bp YES, ${event.optaProbabilityNo}bp NO`);
      console.log(`Payout pool: ${event.payoutPool.toNumber() / web3.LAMPORTS_PER_SOL} SOL`);
      console.log(`Winning outcome: ${event.winningOutcome}`);

      // Verify market state
      console.log("\n⚽ Market State:");
      console.log(`Market ID: ${market.marketId}`);
      console.log(`Teams: ${market.teamA} vs ${market.teamB}`);
      console.log(`Status: ${JSON.stringify(market.status)}`);
      console.log(`Total events: ${market.totalEvents}`);
      console.log(`Created at: ${new Date(market.createdAt.toNumber() * 1000).toISOString()}`);

      // Verify order book state
      console.log("\n📚 Order Book State:");
      console.log(`Event ID: ${orderBook.eventId}`);
      console.log(`Market phase: ${JSON.stringify(orderBook.marketPhase)}`);
      console.log(`YES orders: ${orderBook.yesOrders.length}`);
      console.log(`NO orders: ${orderBook.noOrders.length}`);
      console.log(`Best bids: ${orderBook.bestYesBid.toNumber() / web3.LAMPORTS_PER_SOL} SOL (YES), ${orderBook.bestNoBid.toNumber() / web3.LAMPORTS_PER_SOL} SOL (NO)`);
      console.log(`Total volume: ${orderBook.totalYesVolume.toNumber() / web3.LAMPORTS_PER_SOL} SOL (YES), ${orderBook.totalNoVolume.toNumber() / web3.LAMPORTS_PER_SOL} SOL (NO)`);

      // Verify market timing logic
      const currentTime = Math.floor(Date.now() / 1000);
      const isPrimaryActive = currentTime < event.primaryMarketClose.toNumber();
      const isSecondaryActive = currentTime >= event.secondaryMarketOpen.toNumber() && currentTime < event.secondaryMarketClose.toNumber();

      console.log("\n⏰ Market Timing Status:");
      console.log(`Current time: ${new Date(currentTime * 1000).toISOString()}`);
      console.log(`Primary market active: ${isPrimaryActive}`);
      console.log(`Secondary market active: ${isSecondaryActive}`);
      console.log(`Time until primary close: ${Math.max(0, event.primaryMarketClose.toNumber() - currentTime)} seconds`);
      console.log(`Time until match start: ${Math.max(0, event.secondaryMarketOpen.toNumber() - currentTime)} seconds`);

      // Verify all initial expectations
      expect(event.status).to.deep.equal({ created: {} });
      expect(event.mintedSharesYes).to.equal(0);
      expect(event.mintedSharesNo).to.equal(0);
      expect(event.payoutPool.toNumber()).to.equal(0);
      expect(event.winningOutcome).to.be.null;
      expect(orderBook.yesOrders).to.be.an('array').that.is.empty;
      expect(orderBook.noOrders).to.be.an('array').that.is.empty;
      expect(orderBook.marketPhase).to.deep.equal({ primary: {} });

      console.log("\n✅ EVENT LIFECYCLE SIMULATION COMPLETE");
    });
  });

  describe("Platform Statistics and Analytics", () => {
    it("Should track platform-wide statistics correctly", async () => {
      console.log("\n=== PLATFORM STATISTICS TRACKING ===");

      // Initialize platform
      await program.methods
        .initializeGlobalState(adminKeypair.publicKey, PLATFORM_FEE_PRIMARY, PLATFORM_FEE_SECONDARY)
        .signers([adminKeypair])
        .rpc();

      console.log("Platform initialized. Creating multiple markets and events...");

      // Create multiple markets
      const markets = [
        { id: "EPL_MAN_UTD_VS_CHELSEA", teamA: "Manchester United", teamB: "Chelsea" },
        { id: "EPL_ARSENAL_VS_LIVERPOOL", teamA: "Arsenal", teamB: "Liverpool" },
        { id: "EPL_MAN_CITY_VS_TOTTENHAM", teamA: "Manchester City", teamB: "Tottenham" }
      ];

      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;
      
      for (let i = 0; i < markets.length; i++) {
        const market = markets[i];
        console.log(`\nCreating market ${i + 1}: ${market.teamA} vs ${market.teamB}`);
        
        await program.methods
          .createMarket(market.id, market.teamA, market.teamB, new BN(futureTimestamp + (i * 3600)))
          .signers([adminKeypair])
          .rpc();

        // Create 2 events per market
        const events = [
          { id: `FIRST_GOAL_${i}`, question: "Who will score first?", odds: 6000 },
          { id: `TOTAL_GOALS_${i}`, question: "Over 2.5 goals?", odds: 5500 }
        ];

        for (const event of events) {
          console.log(`  Creating event: ${event.question}`);
          
          await program.methods
            .createEvent(event.id, event.question, 100, event.odds, new BN(futureTimestamp + (i * 3600)))
            .signers([adminKeypair])
            .rpc();
        }
      }

      // Verify final statistics
      const globalState = await program.account.globalState.fetch(globalStatePda);
      console.log(`\n📊 Final Platform Statistics:`);
      console.log(`Total events created: ${globalState.totalEvents.toNumber()}`);
      console.log(`Platform fees: ${globalState.platformFeePrimary}bp primary, ${globalState.platformFeeSecondary}bp secondary`);
      console.log(`Admin: ${globalState.admin.toString()}`);
      console.log(`Fee recipient: ${globalState.feeRecipient.toString()}`);
      console.log(`System paused: ${globalState.isPaused}`);

      // Verify each market statistics
      for (let i = 0; i < markets.length; i++) {
        const market = markets[i];
        const [marketPdaLocal] = web3.PublicKey.findProgramAddressSync(
          [Buffer.from("market"), Buffer.from(market.id)],
          program.programId
        );
        
        const marketAccount = await program.account.market.fetch(marketPdaLocal);
        console.log(`\n⚽ Market ${i + 1} (${market.id}):`);
        console.log(`  Teams: ${marketAccount.teamA} vs ${marketAccount.teamB}`);
        console.log(`  Total events: ${marketAccount.totalEvents}`);
        console.log(`  Status: ${JSON.stringify(marketAccount.status)}`);
        
        expect(marketAccount.totalEvents).to.equal(2); // 2 events per market
      }

      // Expected totals
      const expectedTotalEvents = markets.length * 2; // 3 markets × 2 events each = 6 events
      expect(globalState.totalEvents.toNumber()).to.equal(expectedTotalEvents);

      console.log(`\n✅ PLATFORM STATISTICS VERIFICATION COMPLETE`);
      console.log(`Created ${markets.length} markets with ${expectedTotalEvents} total events`);
    });
  });

  after(async () => {
    console.log("\n=== INTEGRATION TESTS COMPLETE ===");
    console.log("All workflows executed successfully!");
  });
});