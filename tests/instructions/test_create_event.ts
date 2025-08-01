import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";

describe("Create Event", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const connection = provider.connection;

  // Test wallets
  let adminKeypair: web3.Keypair;
  let nonAdminKeypair: web3.Keypair;
  let globalStatePda: web3.PublicKey;

  // Test constants
  const PLATFORM_FEE_PRIMARY = 200; // 2% in basis points
  const PLATFORM_FEE_SECONDARY = 100; // 1% in basis points
  const MARKET_ID = "MATCH001";
  const TEAM_A = "Manchester United";
  const TEAM_B = "Arsenal";

  before(async () => {
    // Generate fresh keypairs for the test suite
    adminKeypair = web3.Keypair.generate();
    nonAdminKeypair = web3.Keypair.generate();

    // Airdrop SOL to test accounts
    await connection.requestAirdrop(adminKeypair.publicKey, 20 * web3.LAMPORTS_PER_SOL);
    await connection.requestAirdrop(nonAdminKeypair.publicKey, 10 * web3.LAMPORTS_PER_SOL);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Derive PDAs
    [globalStatePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );

    // Initialize global state if not already done
    try {
      await program.account.globalState.fetch(globalStatePda);
      console.log("Global state already initialized, skipping...");
    } catch (error) {
      // Global state doesn't exist, initialize it
      await program.methods
        .initializeGlobalState(
          adminKeypair.publicKey,
          PLATFORM_FEE_PRIMARY,
          PLATFORM_FEE_SECONDARY
        )
        .signers([adminKeypair])
        .rpc();
    }

    // Create market if not already done
    const [marketPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(MARKET_ID)],
      program.programId
    );
    
    try {
      await program.account.market.fetch(marketPda);
      console.log("Market already exists, skipping...");
    } catch (error) {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days from now
      await program.methods
        .createMarket(MARKET_ID, TEAM_A, TEAM_B, new BN(futureTimestamp))
        .signers([adminKeypair])
        .rpc();
    }
  });

  describe("Successful event creation", () => {
    it("Should create an event with valid parameters", async () => {
      const eventId = "GOAL_SCORER_001";
      const question = "Will Cristiano Ronaldo score a goal?";
      const maxShares = 100;
      const optaOddsYes = 6000; // 60% in basis points
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      // Derive PDAs
      const [marketPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(MARKET_ID)],
        program.programId
      );

      const [eventPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(eventId)],
        program.programId
      );

      const [orderBookPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
        program.programId
      );

      // Create event
      const tx = await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      console.log("Create event transaction:", tx);

      // Fetch and verify event account
      const eventAccount = await program.account.event.fetch(eventPda);

      expect(eventAccount.eventId).to.equal(eventId);
      expect(eventAccount.marketId).to.equal(MARKET_ID);
      expect(eventAccount.question).to.equal(question);
      expect(eventAccount.maxSharesTotal).to.equal(maxShares);
      expect(eventAccount.maxSharesYes).to.equal(maxShares / 2);
      expect(eventAccount.maxSharesNo).to.equal(maxShares / 2);
      expect(eventAccount.mintedSharesYes).to.equal(0);
      expect(eventAccount.mintedSharesNo).to.equal(0);
      expect(eventAccount.admin.toString()).to.equal(adminKeypair.publicKey.toString());
      expect(eventAccount.status).to.deep.equal({ created: {} });
      expect(eventAccount.payoutPool.toNumber()).to.equal(0);
      expect(eventAccount.winningOutcome).to.be.null;
      expect(eventAccount.bump).to.be.a('number');

      // Verify timing calculations
      expect(eventAccount.primaryMarketClose.toNumber()).to.equal(matchTimestamp - 300); // 5 minutes before
      expect(eventAccount.secondaryMarketOpen.toNumber()).to.equal(matchTimestamp);
      expect(eventAccount.secondaryMarketClose.toNumber()).to.equal(matchTimestamp + 6300); // 105 minutes after

      // Verify order book was created
      const orderBookAccount = await program.account.orderBook.fetch(orderBookPda);
      expect(orderBookAccount.eventId).to.equal(eventId);
      expect(orderBookAccount.marketPhase).to.deep.equal({ primary: {} });
      expect(orderBookAccount.yesOrders).to.be.an('array').that.is.empty;
      expect(orderBookAccount.noOrders).to.be.an('array').that.is.empty;
      expect(orderBookAccount.bestYesBid.toNumber()).to.equal(0);
      expect(orderBookAccount.bestNoBid.toNumber()).to.equal(0);

      // Verify counters were updated
      const globalStateAccount = await program.account.globalState.fetch(globalStatePda);
      expect(globalStateAccount.totalEvents.toNumber()).to.equal(1);

      const marketAccount = await program.account.market.fetch(marketPda);
      expect(marketAccount.totalEvents).to.equal(1);
    });

    it("Should emit EventCreated event", async () => {
      const eventId = "GOAL_SCORER_002";
      const question = "Will Messi score a goal?";
      const maxShares = 200;
      const optaOddsYes = 7500; // 75% in basis points
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      // Listen for events
      let eventReceived = false;
      const listener = program.addEventListener("eventCreated", (event) => {
        expect(event.eventId).to.equal(eventId);
        expect(event.marketId).to.equal(MARKET_ID);
        expect(event.question).to.equal(question);
        expect(event.sharesYes).to.equal(maxShares / 2);
        expect(event.sharesNo).to.equal(maxShares / 2);
        expect(event.admin.toString()).to.equal(adminKeypair.publicKey.toString());
        expect(event.timestamp.toNumber()).to.be.greaterThan(0);
        eventReceived = true;
      });

      // Create event
      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      program.removeEventListener(listener);
      expect(eventReceived).to.be.true;
    });

    it("Should handle maximum length strings", async () => {
      const eventId = "A".repeat(50); // Maximum length
      const question = "B".repeat(200); // Maximum length
      const maxShares = 100;
      const optaOddsYes = 5000; // 50% in basis points
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      const [eventPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(eventId)],
        program.programId
      );

      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      expect(eventAccount.eventId).to.equal(eventId);
      expect(eventAccount.question).to.equal(question);
    });

    it("Should normalize OPTA odds correctly", async () => {
      const eventId = "ODDS_TEST_001";
      const question = "Will there be a goal?";
      const maxShares = 100;
      const optaOddsYes = 8000; // 80% with bookmaker margin
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      const [eventPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(eventId)],
        program.programId
      );

      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      
      // Verify normalized probabilities sum to 10000 (100%)
      expect(eventAccount.optaProbabilityYes + eventAccount.optaProbabilityNo).to.equal(10000);
      
      // Verify share prices sum to 1 SOL
      expect(eventAccount.yesSharePrice.add(eventAccount.noSharePrice).toNumber())
        .to.equal(web3.LAMPORTS_PER_SOL);
    });
  });

  describe("Input validation failures", () => {
    it("Should fail with event ID too long", async () => {
      const eventId = "A".repeat(51); // Too long
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with event ID too long");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("EventIdTooLong");
      }
    });

    it("Should fail with question too long", async () => {
      const eventId = "EVENT_001";
      const question = "A".repeat(201); // Too long
      const maxShares = 100;
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with question too long");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("QuestionTooLong");
      }
    });

    it("Should fail with empty strings", async () => {
      const eventId = ""; // Empty
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with empty event ID");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("InvalidInput");
      }
    });

    it("Should fail with invalid share count (zero)", async () => {
      const eventId = "EVENT_002";
      const question = "Test question";
      const maxShares = 0; // Invalid
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with zero share count");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("InvalidShareCount");
      }
    });

    it("Should fail with invalid share count (too high)", async () => {
      const eventId = "EVENT_003";
      const question = "Test question";
      const maxShares = 1001; // Too high
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with share count too high");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("InvalidShareCount");
      }
    });

    it("Should fail with odd share count", async () => {
      const eventId = "EVENT_004";
      const question = "Test question";
      const maxShares = 101; // Odd number
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with odd share count");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("ShareCountMustBeEven");
      }
    });

    it("Should fail with invalid odds (zero)", async () => {
      const eventId = "EVENT_005";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 0; // Invalid
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with zero odds");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("InvalidOdds");
      }
    });

    it("Should fail with invalid odds (too high)", async () => {
      const eventId = "EVENT_006";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 10000; // Invalid (100% or higher)
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with odds too high");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("InvalidOdds");
      }
    });

    it("Should fail with match too soon", async () => {
      const eventId = "EVENT_007";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 3600; // Only 1 hour from now

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with match too soon");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("MatchTooSoon");
      }
    });
  });

  describe("Authorization failures", () => {
    it("Should fail with non-admin signer", async () => {
      const eventId = "EVENT_008";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.methods
          .createEvent(
            eventId,
            question,
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([nonAdminKeypair])
          .rpc();
        expect.fail("Should have failed with non-admin signer");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  describe("Duplicate event prevention", () => {
    it("Should fail when creating event with duplicate ID in same market", async () => {
      const eventId = "EVENT_009";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      // Create first event successfully
      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      // Try to create second event with same ID in same market
      try {
        await program.methods
          .createEvent(
            eventId,
            "Different question",
            maxShares,
            optaOddsYes,
            new BN(matchTimestamp)
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed with duplicate event ID");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("PDA validation", () => {
    it("Should verify correct event and order book PDA derivation", async () => {
      const eventId = "EVENT_010";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      const [expectedEventPda, expectedEventBump] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(eventId)],
        program.programId
      );

      const [expectedOrderBookPda, expectedOrderBookBump] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
        program.programId
      );

      // Create event
      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      // Verify event PDA and bump
      const eventAccount = await program.account.event.fetch(expectedEventPda);
      expect(eventAccount.bump).to.equal(expectedEventBump);
      expect(eventAccount.eventId).to.equal(eventId);

      // Verify order book PDA and bump
      const orderBookAccount = await program.account.orderBook.fetch(expectedOrderBookPda);
      expect(orderBookAccount.bump).to.equal(expectedOrderBookBump);
      expect(orderBookAccount.eventId).to.equal(eventId);
    });
  });

  describe("Edge cases", () => {
    it("Should handle minimum valid share count", async () => {
      const eventId = "EVENT_011";
      const question = "Test question";
      const maxShares = 2; // Minimum valid (even number > 0)
      const optaOddsYes = 5000;
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      const [eventPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(eventId)],
        program.programId
      );

      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      expect(eventAccount.maxSharesTotal).to.equal(maxShares);
      expect(eventAccount.maxSharesYes).to.equal(1);
      expect(eventAccount.maxSharesNo).to.equal(1);
    });

    it("Should handle extreme odds (very low probability)", async () => {
      const eventId = "EVENT_012";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 1; // Very low probability
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      const [eventPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(eventId)],
        program.programId
      );

      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      expect(eventAccount.optaProbabilityYes).to.be.lessThan(eventAccount.optaProbabilityNo);
    });

    it("Should handle extreme odds (very high probability)", async () => {
      const eventId = "EVENT_013";
      const question = "Test question";
      const maxShares = 100;
      const optaOddsYes = 9999; // Very high probability
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      const [eventPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(MARKET_ID), Buffer.from(eventId)],
        program.programId
      );

      await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new BN(matchTimestamp)
        )
        .signers([adminKeypair])
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      expect(eventAccount.optaProbabilityYes).to.be.greaterThan(eventAccount.optaProbabilityNo);
    });
  });

  after(async () => {
    // Cleanup: Close accounts if needed
    // Note: In test environment, accounts are automatically cleaned up
  });
});