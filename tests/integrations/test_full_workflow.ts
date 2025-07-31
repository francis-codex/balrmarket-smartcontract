import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("Full Event Creation Workflow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet;

  // Test data for complete workflow
  const testData = {
    // Market data
    marketId: "complete_workflow_test",
    teamA: "FC Barcelona",
    teamB: "Real Madrid",
    matchTimestamp: Math.floor(Date.now() / 1000) + 86400 * 3, // 3 days from now

    // Event data
    eventId: "will_barcelona_win",
    question: "Will FC Barcelona win El Clásico?",
    maxShares: 1000,
    optaOddsYes: 4500, // 45% probability with some margin

    // Fee configuration
    platformFeePrimary: 200,   // 2%
    platformFeeSecondary: 50,  // 0.5%
  };

  // PDAs that will be created
  let globalStatePDA: PublicKey;
  let marketPDA: PublicKey;
  let eventPDA: PublicKey;
  let orderBookPDA: PublicKey;

  before(async () => {
    // Derive all PDAs
    [globalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );

    [marketPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(testData.marketId)],
      program.programId
    );

    [eventPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(testData.marketId), Buffer.from(testData.eventId)],
      program.programId
    );

    [orderBookPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("orderbook"), Buffer.from(testData.eventId), Buffer.from("primary")],
      program.programId
    );
  });

  describe("Complete System Initialization and Event Creation", () => {
    it("Step 1: Initialize Global State", async () => {
      console.log("\n Step 1: Initializing Global State...");
      
      const tx = await program.methods
        .initializeGlobalState(
          admin.publicKey,
          testData.platformFeePrimary,
          testData.platformFeeSecondary
        )
        .accounts({
          globalState: globalStatePDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(` Global State initialized: ${tx}`);

      // Verify global state
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      expect(globalState.admin.toString()).to.equal(admin.publicKey.toString());
      expect(globalState.totalEvents.toNumber()).to.equal(0);
      expect(globalState.platformFeePrimary).to.equal(testData.platformFeePrimary);
      expect(globalState.platformFeeSecondary).to.equal(testData.platformFeeSecondary);
      expect(globalState.isPaused).to.be.false;

      console.log(`   Admin: ${globalState.admin.toString().slice(0, 8)}...`);
      console.log(`   Primary Fee: ${globalState.platformFeePrimary}bp (${globalState.platformFeePrimary / 100}%)`);
      console.log(`   Secondary Fee: ${globalState.platformFeeSecondary}bp (${globalState.platformFeeSecondary / 100}%)`);
      console.log(`   Total Events: ${globalState.totalEvents.toNumber()}`);
    });

    it("Step 2: Create Market", async () => {
      console.log("\n  Step 2: Creating Market...");
      
      const tx = await program.methods
        .createMarket(
          testData.marketId,
          testData.teamA,
          testData.teamB,
          new anchor.BN(testData.matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(` Market created: ${tx}`);

      // Verify market
      const market = await program.account.market.fetch(marketPDA);
      expect(market.marketId).to.equal(testData.marketId);
      expect(market.teamA).to.equal(testData.teamA);
      expect(market.teamB).to.equal(testData.teamB);
      expect(market.matchTimestamp.toNumber()).to.equal(testData.matchTimestamp);
      expect(market.admin.toString()).to.equal(admin.publicKey.toString());
      expect(market.totalEvents).to.equal(0);

      const matchDate = new Date(testData.matchTimestamp * 1000);
      console.log(`   Market: ${testData.teamA} vs ${testData.teamB}`);
      console.log(`   Match Time: ${matchDate.toLocaleString()}`);
      console.log(`   Market Status: Created`);
      console.log(`   Total Events: ${market.totalEvents}`);
    });

    it("Step 3: Create Event with OPTA Integration", async () => {
      console.log("\n Step 3: Creating Event with OPTA odds...");
      
      const tx = await program.methods
        .createEvent(
          testData.eventId,
          testData.question,
          testData.maxShares,
          testData.optaOddsYes,
          new anchor.BN(testData.matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: eventPDA,
          orderBook: orderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(` Event created: ${tx}`);

      // Verify event
      const event = await program.account.event.fetch(eventPDA);
      expect(event.eventId).to.equal(testData.eventId);
      expect(event.marketId).to.equal(testData.marketId);
      expect(event.question).to.equal(testData.question);
      expect(event.maxSharesTotal).to.equal(testData.maxShares);
      expect(event.maxSharesYes).to.equal(testData.maxShares / 2);
      expect(event.maxSharesNo).to.equal(testData.maxShares / 2);
      expect(event.admin.toString()).to.equal(admin.publicKey.toString());

      // Verify pricing
      const totalPrice = event.yesSharePrice.toNumber() + event.noSharePrice.toNumber();
      expect(totalPrice).to.equal(LAMPORTS_PER_SOL);

      // Verify OPTA odds normalization
      const totalProbability = event.optaProbabilityYes + event.optaProbabilityNo;
      expect(totalProbability).to.equal(10000);

      // Verify timing
      expect(event.primaryMarketClose.toNumber()).to.equal(testData.matchTimestamp - 300);
      expect(event.secondaryMarketOpen.toNumber()).to.equal(testData.matchTimestamp);
      expect(event.secondaryMarketClose.toNumber()).to.equal(testData.matchTimestamp + 6300);

      console.log(`   Question: ${testData.question}`);
      console.log(`   Max Shares: ${testData.maxShares} (${event.maxSharesYes} YES, ${event.maxSharesNo} NO)`);
      console.log(`   OPTA Input: ${testData.optaOddsYes}bp (${testData.optaOddsYes / 100}%)`);
      console.log(`   Normalized: ${event.optaProbabilityYes}bp YES, ${event.optaProbabilityNo}bp NO`);
      console.log(`   Share Prices: ${event.yesSharePrice.toNumber() / LAMPORTS_PER_SOL} SOL YES, ${event.noSharePrice.toNumber() / LAMPORTS_PER_SOL} SOL NO`);
      
      const primaryCloseDate = new Date(event.primaryMarketClose.toNumber() * 1000);
      const secondaryOpenDate = new Date(event.secondaryMarketOpen.toNumber() * 1000);
      const secondaryCloseDate = new Date(event.secondaryMarketClose.toNumber() * 1000);
      
      console.log(`   Primary Market Closes: ${primaryCloseDate.toLocaleString()}`);
      console.log(`   Secondary Market Opens: ${secondaryOpenDate.toLocaleString()}`);
      console.log(`   Secondary Market Closes: ${secondaryCloseDate.toLocaleString()}`);
    });

    it("Step 4: Verify Order Book Initialization", async () => {
      console.log("\n Step 4: Verifying Order Book...");
      
      const orderBook = await program.account.orderBook.fetch(orderBookPDA);
      
      expect(orderBook.eventId).to.equal(testData.eventId);
      expect(orderBook.marketPhase).to.deep.equal({ primary: {} });
      expect(orderBook.yesOrders.length).to.equal(0);
      expect(orderBook.noOrders.length).to.equal(0);
      expect(orderBook.bestYesBid.toNumber()).to.equal(0);
      expect(orderBook.bestNoBid.toNumber()).to.equal(0);
      expect(orderBook.totalYesVolume.toNumber()).to.equal(0);
      expect(orderBook.totalNoVolume.toNumber()).to.equal(0);

      console.log(` Order Book initialized for event: ${orderBook.eventId}`);
      console.log(`   Market Phase: Primary`);
      console.log(`   YES Orders: ${orderBook.yesOrders.length}`);
      console.log(`   NO Orders: ${orderBook.noOrders.length}`);
      console.log(`   Total Volume: ${orderBook.totalYesVolume.toNumber() + orderBook.totalNoVolume.toNumber()} SOL`);
    });

    it("Step 5: Verify Counter Updates", async () => {
      console.log("\n Step 5: Verifying Counter Updates...");
      
      // Check global state counter
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      expect(globalState.totalEvents.toNumber()).to.equal(1);

      // Check market counter
      const market = await program.account.market.fetch(marketPDA);
      expect(market.totalEvents).to.equal(1);

      console.log(` Counters updated successfully`);
      console.log(`   Global Total Events: ${globalState.totalEvents.toNumber()}`);
      console.log(`   Market Total Events: ${market.totalEvents}`);
    });
  });

  describe("System State Verification", () => {
    it("Verifies all accounts are properly linked", async () => {
      console.log("\n Verifying Account Relationships...");
      
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const market = await program.account.market.fetch(marketPDA);
      const event = await program.account.event.fetch(eventPDA);
      const orderBook = await program.account.orderBook.fetch(orderBookPDA);

      // Verify admin relationships
      expect(globalState.admin.toString()).to.equal(market.admin.toString());
      expect(market.admin.toString()).to.equal(event.admin.toString());

      // Verify ID relationships
      expect(market.marketId).to.equal(event.marketId);
      expect(event.eventId).to.equal(orderBook.eventId);

      // Verify timing relationships
      expect(event.primaryMarketClose.toNumber()).to.be.lessThan(market.matchTimestamp.toNumber());
      expect(event.secondaryMarketOpen.toNumber()).to.equal(market.matchTimestamp.toNumber());
      expect(event.secondaryMarketClose.toNumber()).to.be.greaterThan(market.matchTimestamp.toNumber());

      console.log(` All account relationships verified`);
    });

    it("Verifies PDA derivations are correct", async () => {
      console.log("\n Verifying PDA Derivations...");
      
      // Verify Global State PDA
      const [expectedGlobalPDA, globalBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        program.programId
      );
      expect(globalStatePDA.toString()).to.equal(expectedGlobalPDA.toString());

      // Verify Market PDA
      const [expectedMarketPDA, marketBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testData.marketId)],
        program.programId
      );
      expect(marketPDA.toString()).to.equal(expectedMarketPDA.toString());

      // Verify Event PDA
      const [expectedEventPDA, eventBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(testData.marketId), Buffer.from(testData.eventId)],
        program.programId
      );
      expect(eventPDA.toString()).to.equal(expectedEventPDA.toString());

      // Verify Order Book PDA
      const [expectedOrderBookPDA, orderBookBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testData.eventId), Buffer.from("primary")],
        program.programId
      );
      expect(orderBookPDA.toString()).to.equal(expectedOrderBookPDA.toString());

      // Verify bumps are stored correctly
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const market = await program.account.market.fetch(marketPDA);
      const event = await program.account.event.fetch(eventPDA);
      const orderBook = await program.account.orderBook.fetch(orderBookPDA);

      expect(globalState.bump).to.equal(globalBump);
      expect(market.bump).to.equal(marketBump);
      expect(event.bump).to.equal(eventBump);
      expect(orderBook.bump).to.equal(orderBookBump);

      console.log(` All PDA derivations correct`);
      console.log(`   Global State: ${globalStatePDA.toString().slice(0, 8)}... (bump: ${globalBump})`);
      console.log(`   Market: ${marketPDA.toString().slice(0, 8)}... (bump: ${marketBump})`);
      console.log(`   Event: ${eventPDA.toString().slice(0, 8)}... (bump: ${eventBump})`);
      console.log(`   Order Book: ${orderBookPDA.toString().slice(0, 8)}... (bump: ${orderBookBump})`);
    });

    it("Verifies rent exemption for all accounts", async () => {
      console.log("\n💰 Verifying Rent Exemption...");
      
      const accounts = [
        { pda: globalStatePDA, name: "Global State" },
        { pda: marketPDA, name: "Market" },
        { pda: eventPDA, name: "Event" },
        { pda: orderBookPDA, name: "Order Book" }
      ];

      let totalRentCost = 0;

      for (const { pda, name } of accounts) {
        const accountInfo = await provider.connection.getAccountInfo(pda);
        expect(accountInfo).to.not.be.null;

        const rentExemptMinimum = await provider.connection.getMinimumBalanceForRentExemption(
          accountInfo!.data.length
        );

        expect(accountInfo!.lamports).to.be.greaterThanOrEqual(rentExemptMinimum);
        totalRentCost += accountInfo!.lamports;

        console.log(`   ${name}: ${accountInfo!.lamports / LAMPORTS_PER_SOL} SOL (${accountInfo!.data.length} bytes)`);
      }

      console.log(` Total rent cost: ${totalRentCost / LAMPORTS_PER_SOL} SOL`);
      expect(totalRentCost / LAMPORTS_PER_SOL).to.be.lessThan(0.1); // Should be reasonable
    });
  });

  describe("Mathematical Verification", () => {
    it("Verifies OPTA odds normalization mathematics", async () => {
      console.log("\n Verifying OPTA Odds Mathematics...");
      
      const event = await program.account.event.fetch(eventPDA);
      
      // Original input odds
      const inputOdds = testData.optaOddsYes; // 4500 = 45%
      const impliedNoOdds = 10000 - inputOdds; // 5500 = 55%
      const totalImplied = inputOdds + impliedNoOdds; // Should be 10000 (100%)

      console.log(`   Input OPTA odds:`);
      console.log(`     YES: ${inputOdds}bp (${inputOdds / 100}%)`);
      console.log(`     NO: ${impliedNoOdds}bp (${impliedNoOdds / 100}%)`);
      console.log(`     Total: ${totalImplied}bp (${totalImplied / 100}%)`);

      // Normalized odds (stored in contract)
      const normalizedYes = event.optaProbabilityYes;
      const normalizedNo = event.optaProbabilityNo;
      const normalizedTotal = normalizedYes + normalizedNo;

      console.log(`   Normalized odds:`);
      console.log(`     YES: ${normalizedYes}bp (${normalizedYes / 100}%)`);
      console.log(`     NO: ${normalizedNo}bp (${normalizedNo / 100}%)`);
      console.log(`     Total: ${normalizedTotal}bp (${normalizedTotal / 100}%)`);

      // Verify normalization
      expect(normalizedTotal).to.equal(10000);
      
      // Since input was already 100%, normalized should be very close to input
      expect(Math.abs(normalizedYes - inputOdds)).to.be.lessThan(10); // Within 0.1%
      expect(Math.abs(normalizedNo - impliedNoOdds)).to.be.lessThan(10);

      console.log(` OPTA odds normalization verified`);
    });

    it("Verifies share price calculations", async () => {
      console.log("\n💲 Verifying Share Price Calculations...");
      
      const event = await program.account.event.fetch(eventPDA);
      
      const yesPrice = event.yesSharePrice.toNumber();
      const noPrice = event.noSharePrice.toNumber();
      const totalPrice = yesPrice + noPrice;

      // Verify prices sum to exactly 1 SOL
      expect(totalPrice).to.equal(LAMPORTS_PER_SOL);

      // Calculate expected prices from normalized probabilities
      const expectedYesPrice = Math.floor((event.optaProbabilityYes * LAMPORTS_PER_SOL) / 10000);
      const expectedNoPrice = LAMPORTS_PER_SOL - expectedYesPrice;

      expect(yesPrice).to.equal(expectedYesPrice);
      expect(noPrice).to.equal(expectedNoPrice);

      console.log(`   Share prices:`);
      console.log(`     YES: ${yesPrice / LAMPORTS_PER_SOL} SOL (${yesPrice} lamports)`);
      console.log(`     NO: ${noPrice / LAMPORTS_PER_SOL} SOL (${noPrice} lamports)`);
      console.log(`     Total: ${totalPrice / LAMPORTS_PER_SOL} SOL`);

      console.log(` Share price calculations verified`);
    });

    it("Verifies timing calculations", async () => {
      console.log("\n Verifying Timing Calculations...");
      
      const event = await program.account.event.fetch(eventPDA);
      const market = await program.account.market.fetch(marketPDA);

      const matchTimestamp = market.matchTimestamp.toNumber();
      const primaryClose = event.primaryMarketClose.toNumber();
      const secondaryOpen = event.secondaryMarketOpen.toNumber();
      const secondaryClose = event.secondaryMarketClose.toNumber();

      // Verify timing relationships
      expect(primaryClose).to.equal(matchTimestamp - 300); // 5 minutes before
      expect(secondaryOpen).to.equal(matchTimestamp); // Exactly at match start
      expect(secondaryClose).to.equal(matchTimestamp + 6300); // 105 minutes after

      // Verify sequence
      expect(primaryClose).to.be.lessThan(secondaryOpen);
      expect(secondaryOpen).to.be.lessThan(secondaryClose);

      const matchDate = new Date(matchTimestamp * 1000);
      const primaryCloseDate = new Date(primaryClose * 1000);
      const secondaryOpenDate = new Date(secondaryOpen * 1000);
      const secondaryCloseDate = new Date(secondaryClose * 1000);

      console.log(`   Timing schedule:`);
      console.log(`     Match Start: ${matchDate.toLocaleString()}`);
      console.log(`     Primary Closes: ${primaryCloseDate.toLocaleString()} (5 min before)`);
      console.log(`     Secondary Opens: ${secondaryOpenDate.toLocaleString()} (at kickoff)`);
      console.log(`     Secondary Closes: ${secondaryCloseDate.toLocaleString()} (105 min after)`);

      console.log(` Timing calculations verified`);
    });
  });

  describe("Transaction Cost Analysis", () => {
    it("Analyzes total deployment cost", async () => {
      console.log("\n Analyzing Total Deployment Cost...");
      
      // Get account info for all created accounts
      const globalStateInfo = await provider.connection.getAccountInfo(globalStatePDA);
      const marketInfo = await provider.connection.getAccountInfo(marketPDA);
      const eventInfo = await provider.connection.getAccountInfo(eventPDA);
      const orderBookInfo = await provider.connection.getAccountInfo(orderBookPDA);

      const totalRentCost = globalStateInfo!.lamports + marketInfo!.lamports + 
                           eventInfo!.lamports + orderBookInfo!.lamports;

      const totalDataSize = globalStateInfo!.data.length + marketInfo!.data.length + 
                           eventInfo!.data.length + orderBookInfo!.data.length;

      console.log(`   Cost breakdown:`);
      console.log(`     Global State: ${globalStateInfo!.lamports / LAMPORTS_PER_SOL} SOL (${globalStateInfo!.data.length} bytes)`);
      console.log(`     Market: ${marketInfo!.lamports / LAMPORTS_PER_SOL} SOL (${marketInfo!.data.length} bytes)`);
      console.log(`     Event: ${eventInfo!.lamports / LAMPORTS_PER_SOL} SOL (${eventInfo!.data.length} bytes)`);
      console.log(`     Order Book: ${orderBookInfo!.lamports / LAMPORTS_PER_SOL} SOL (${orderBookInfo!.data.length} bytes)`);
      console.log(`     Total Rent: ${totalRentCost / LAMPORTS_PER_SOL} SOL`);
      console.log(`     Total Data: ${totalDataSize} bytes`);

      // Verify costs are reasonable
      expect(totalRentCost / LAMPORTS_PER_SOL).to.be.lessThan(0.1); // Less than 0.1 SOL
      expect(totalDataSize).to.be.lessThan(10000); // Less than 10KB

      console.log(` Deployment cost analysis complete`);
    });

    it("Estimates operational costs", async () => {
      console.log("\n⚡ Estimating Operational Costs...");
      
      const event = await program.account.event.fetch(eventPDA);
      
      // Estimate costs for typical operations
      const estimatedCosts = {
        eventCreation: 0.005, // SOL (from our test)
        primaryOrder: 0.002,  // Estimated
        secondaryTrade: 0.001, // Estimated
        marketResolution: 0.003, // Estimated
        claimWinnings: 0.001, // Estimated
      };

      console.log(`   Estimated operational costs:`);
      Object.entries(estimatedCosts).forEach(([operation, cost]) => {
        console.log(`     ${operation}: ${cost} SOL`);
      });

      const maxShares = event.maxSharesTotal;
      const worstCaseOrders = maxShares; // If every share requires separate order
      const maxOperationalCost = worstCaseOrders * estimatedCosts.primaryOrder;

      console.log(`   Worst case scenario (${maxShares} individual orders): ${maxOperationalCost} SOL`);
      
      // Should be reasonable even in worst case
      expect(maxOperationalCost).to.be.lessThan(5); // Less than 5 SOL for max activity

      console.log(` Operational cost estimates completed`);
    });
  });

  describe("Data Integrity and Consistency", () => {
    it("Verifies data persistence across fetches", async () => {
      console.log("\n Verifying Data Persistence...");
      
      // Fetch the same accounts multiple times to ensure consistency
      const fetches = await Promise.all([
        program.account.event.fetch(eventPDA),
        program.account.event.fetch(eventPDA),
        program.account.event.fetch(eventPDA),
      ]);

      // All fetches should return identical data
      const [fetch1, fetch2, fetch3] = fetches;
      
      expect(fetch1.eventId).to.equal(fetch2.eventId);
      expect(fetch2.eventId).to.equal(fetch3.eventId);
      expect(fetch1.yesSharePrice.toNumber()).to.equal(fetch2.yesSharePrice.toNumber());
      expect(fetch2.yesSharePrice.toNumber()).to.equal(fetch3.yesSharePrice.toNumber());
      expect(fetch1.optaProbabilityYes).to.equal(fetch2.optaProbabilityYes);
      expect(fetch2.optaProbabilityYes).to.equal(fetch3.optaProbabilityYes);

      console.log(` Data persistence verified across multiple fetches`);
    });

    it("Verifies string encoding and retrieval", async () => {
      console.log("\n Verifying String Encoding...");
      
      const event = await program.account.event.fetch(eventPDA);
      const market = await program.account.market.fetch(marketPDA);

      // Verify all strings are exactly as input
      expect(event.eventId).to.equal(testData.eventId);
      expect(event.question).to.equal(testData.question);
      expect(event.marketId).to.equal(testData.marketId);
      expect(market.marketId).to.equal(testData.marketId);
      expect(market.teamA).to.equal(testData.teamA);
      expect(market.teamB).to.equal(testData.teamB);

      console.log(`   Verified string fields:`);
      console.log(`     Event ID: "${event.eventId}"`);
      console.log(`     Question: "${event.question}"`);
      console.log(`     Market ID: "${market.marketId}"`);
      console.log(`     Team A: "${market.teamA}"`);
      console.log(`     Team B: "${market.teamB}"`);

      console.log(`String encoding/retrieval verified`);
    });
  });

  describe("System Readiness Verification", () => {
    it("Verifies system is ready for trading", async () => {
      console.log("\n🚦 Verifying System Readiness for Trading...");
      
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const market = await program.account.market.fetch(marketPDA);
      const event = await program.account.event.fetch(eventPDA);
      const orderBook = await program.account.orderBook.fetch(orderBookPDA);

      // Check all critical states
      const checks = {
        "Global state not paused": !globalState.isPaused,
        "Market status is Created": market.status.hasOwnProperty('created'),
        "Event status is Created": event.status.hasOwnProperty('created'),
        "Order book is in Primary phase": orderBook.marketPhase.hasOwnProperty('primary'),
        "No shares minted yet": event.mintedSharesYes === 0 && event.mintedSharesNo === 0,
        "Payout pool is empty": event.payoutPool.toNumber() === 0,
        "Order book is empty": orderBook.yesOrders.length === 0 && orderBook.noOrders.length === 0,
        "Share prices are set": event.yesSharePrice.toNumber() > 0 && event.noSharePrice.toNumber() > 0,
        "Max shares configured": event.maxSharesTotal > 0,
        "Timing is valid": event.primaryMarketClose.toNumber() > Math.floor(Date.now() / 1000),
      };

      console.log(`   System readiness checks:`);
      Object.entries(checks).forEach(([check, passed]) => {
        const status = passed ? "pass" : "fail";
        console.log(`     ${status} ${check}`);
        expect(passed).to.be.true;
      });

      console.log(`System is ready for primary market trading`);
    });

    it("Provides comprehensive system summary", async () => {
      console.log("\n System Summary...");
      
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const market = await program.account.market.fetch(marketPDA);
      const event = await program.account.event.fetch(eventPDA);
      const orderBook = await program.account.orderBook.fetch(orderBookPDA);

      console.log(`\n   GLOBAL STATE`);
      console.log(`     Admin: ${globalState.admin.toString()}`);
      console.log(`     Total Events: ${globalState.totalEvents.toNumber()}`);
      console.log(`     Primary Fee: ${globalState.platformFeePrimary}bp (${globalState.platformFeePrimary / 100}%)`);
      console.log(`     Secondary Fee: ${globalState.platformFeeSecondary}bp (${globalState.platformFeeSecondary / 100}%)`);
      console.log(`     System Status: ${globalState.isPaused ? "PAUSED" : "ACTIVE"}`);

      console.log(`\n   MARKET`);
      console.log(`     ID: ${market.marketId}`);
      console.log(`     Fixture: ${market.teamA} vs ${market.teamB}`);
      console.log(`     Match Time: ${new Date(market.matchTimestamp.toNumber() * 1000).toLocaleString()}`);
      console.log(`     Status: Created`);
      console.log(`     Events: ${market.totalEvents}`);

      console.log(`\n   EVENT`);
      console.log(`     ID: ${event.eventId}`);
      console.log(`     Question: ${event.question}`);
      console.log(`     Max Shares: ${event.maxSharesTotal} (${event.maxSharesYes} YES, ${event.maxSharesNo} NO)`);
      console.log(`     Minted: ${event.mintedSharesYes + event.mintedSharesNo} (${event.mintedSharesYes} YES, ${event.mintedSharesNo} NO)`);
      console.log(`     Share Prices: ${event.yesSharePrice.toNumber() / LAMPORTS_PER_SOL} SOL YES, ${event.noSharePrice.toNumber() / LAMPORTS_PER_SOL} SOL NO`);
      console.log(`     OPTA Odds: ${event.optaProbabilityYes}bp YES, ${event.optaProbabilityNo}bp NO`);
      console.log(`     Status: Created`);
      console.log(`     Payout Pool: ${event.payoutPool.toNumber() / LAMPORTS_PER_SOL} SOL`);

      console.log(`\n   ORDER BOOK`);
      console.log(`     Event: ${orderBook.eventId}`);
      console.log(`     Phase: Primary`);
      console.log(`     YES Orders: ${orderBook.yesOrders.length}`);
      console.log(`     NO Orders: ${orderBook.noOrders.length}`);
      console.log(`     Volume: ${(orderBook.totalYesVolume.toNumber() + orderBook.totalNoVolume.toNumber()) / LAMPORTS_PER_SOL} SOL`);

      console.log(`\n   TIMELINE`);
      const now = new Date();
      const primaryClose = new Date(event.primaryMarketClose.toNumber() * 1000);
      const secondaryOpen = new Date(event.secondaryMarketOpen.toNumber() * 1000);
      const secondaryClose = new Date(event.secondaryMarketClose.toNumber() * 1000);
      
      console.log(`     Current Time: ${now.toLocaleString()}`);
      console.log(`     Primary Closes: ${primaryClose.toLocaleString()}`);
      console.log(`     Secondary Opens: ${secondaryOpen.toLocaleString()}`);
      console.log(`     Secondary Closes: ${secondaryClose.toLocaleString()}`);

      console.log(`\n COMPLETE EVENT CREATION WORKFLOW SUCCESSFUL`);
      console.log(`   Ready for primary market trading to begin!`);
    });
  });
});