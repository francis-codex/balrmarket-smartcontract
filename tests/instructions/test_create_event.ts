import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";

describe("Create Event", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet;

  let globalStatePDA: PublicKey;
  let marketPDA: PublicKey;

  // Test data
  const marketId = "test_market_for_events";
  const teamA = "Manchester United";
  const teamB = "Arsenal";
  const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days from now

  const eventId = "will_man_utd_win";
  const question = "Will Manchester United win?";
  const maxShares = 1000;
  const optaOddsYes = 5640; // 56.40% in basis points

  before(async () => {
    [globalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );

    [marketPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(marketId)],
      program.programId
    );

    // Setup: Ensure global state and market exist
    try {
      await program.account.globalState.fetch(globalStatePDA);
    } catch (error) {
      await program.methods
        .initializeGlobalState(admin.publicKey, 200, 50)
        .accounts({
          globalState: globalStatePDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    try {
      await program.account.market.fetch(marketPDA);
    } catch (error) {
      await program.methods
        .createMarket(marketId, teamA, teamB, new anchor.BN(matchTimestamp))
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  });

  describe("Successful Event Creation", () => {
    let eventPDA: PublicKey;
    let orderBookPDA: PublicKey;

    before(async () => {
      [eventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
        program.programId
      );

      [orderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
        program.programId
      );
    });

    it("Creates an event with valid parameters", async () => {
      const tx = await program.methods
        .createEvent(
          eventId,
          question,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
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

      console.log("Event Creation Transaction:", tx);

      // Verify event was created correctly
      const event = await program.account.event.fetch(eventPDA);
      expect(event.eventId).to.equal(eventId);
      expect(event.marketId).to.equal(marketId);
      expect(event.question).to.equal(question);
      expect(event.maxSharesTotal).to.equal(maxShares);
      expect(event.maxSharesYes).to.equal(maxShares / 2);
      expect(event.maxSharesNo).to.equal(maxShares / 2);
      expect(event.mintedSharesYes).to.equal(0);
      expect(event.mintedSharesNo).to.equal(0);
      expect(event.admin.toString()).to.equal(admin.publicKey.toString());
      expect(event.payoutPool.toNumber()).to.equal(0);
      expect(event.status).to.deep.equal({ created: {} });
      expect(event.winningOutcome).to.be.null;
    });

    it("Calculates share prices correctly", async () => {
      const event = await program.account.event.fetch(eventPDA);
      
      // Prices should sum to exactly 1 SOL
      const totalPrice = event.yesSharePrice.toNumber() + event.noSharePrice.toNumber();
      expect(totalPrice).to.equal(LAMPORTS_PER_SOL);
      
      // YES price should be higher (since 56.40% probability)
      expect(event.yesSharePrice.toNumber()).to.be.greaterThan(event.noSharePrice.toNumber());
      
      // Both prices should be positive
      expect(event.yesSharePrice.toNumber()).to.be.greaterThan(0);
      expect(event.noSharePrice.toNumber()).to.be.greaterThan(0);
    });

    it("Sets timing correctly", async () => {
      const event = await program.account.event.fetch(eventPDA);
      
      expect(event.primaryMarketClose.toNumber()).to.equal(matchTimestamp - 300); // 5 min before
      expect(event.secondaryMarketOpen.toNumber()).to.equal(matchTimestamp);
      expect(event.secondaryMarketClose.toNumber()).to.equal(matchTimestamp + 6300); // 105 min after
      expect(event.createdAt.toNumber()).to.be.greaterThan(0);
      expect(event.resolutionTimestamp.toNumber()).to.equal(0); // Not resolved yet
    });

    it("Normalizes OPTA odds correctly", async () => {
      const event = await program.account.event.fetch(eventPDA);
      
      // Normalized probabilities should sum to exactly 10000 basis points
      const totalProbability = event.optaProbabilityYes + event.optaProbabilityNo;
      expect(totalProbability).to.equal(10000);
      
      // YES probability should be close to input (after normalization)
      expect(event.optaProbabilityYes).to.be.greaterThan(5000); // > 50%
      expect(event.optaProbabilityYes).to.be.lessThan(6000); // < 60% (accounting for normalization)
    });

    it("Initializes order book correctly", async () => {
      const orderBook = await program.account.orderBook.fetch(orderBookPDA);
      
      expect(orderBook.eventId).to.equal(eventId);
      expect(orderBook.marketPhase).to.deep.equal({ primary: {} });
      expect(orderBook.yesOrders.length).to.equal(0);
      expect(orderBook.noOrders.length).to.equal(0);
      expect(orderBook.bestYesBid.toNumber()).to.equal(0);
      expect(orderBook.bestNoBid.toNumber()).to.equal(0);
      expect(orderBook.totalYesVolume.toNumber()).to.equal(0);
      expect(orderBook.totalNoVolume.toNumber()).to.equal(0);
      expect(orderBook.lastPriceUpdate.toNumber()).to.be.greaterThan(0);
    });

    it("Updates global and market counters", async () => {
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const market = await program.account.market.fetch(marketPDA);
      
      expect(globalState.totalEvents.toNumber()).to.be.greaterThan(0);
      expect(market.totalEvents).to.be.greaterThan(0);
    });
  });

  describe("Input Parameter Validation", () => {
    it("Rejects event ID that is too long", async () => {
      const longEventId = "a".repeat(51); // Max is 50
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(longEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(longEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            longEventId,
            question,
            maxShares,
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with event ID too long");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Event ID too long");
      }
    });

    it("Rejects question that is too long", async () => {
      const longQuestion = "a".repeat(201); // Max is 200
      const testEventId = "test_long_question";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            longQuestion,
            maxShares,
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with question too long");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Question too long");
      }
    });

    it("Rejects empty strings", async () => {
      const testEventId = "test_empty_strings";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            "", // Empty event ID
            question,
            maxShares,
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with empty event ID");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Invalid input");
      }
    });

    it("Accepts maximum length strings", async () => {
      const maxEventId = "b".repeat(50);
      const maxQuestion = "c".repeat(200);
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(maxEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(maxEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          maxEventId,
          maxQuestion,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const event = await program.account.event.fetch(testEventPDA);
      expect(event.eventId).to.equal(maxEventId);
      expect(event.question).to.equal(maxQuestion);
    });
  });

  describe("Share Count Validation", () => {
    it("Rejects zero shares", async () => {
      const testEventId = "test_zero_shares";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            0, // Zero shares
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with zero shares");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Invalid share count");
      }
    });

    it("Rejects odd number of shares", async () => {
      const testEventId = "test_odd_shares";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            999, // Odd number
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with odd shares");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Share count must be even");
      }
    });

    it("Rejects shares exceeding maximum", async () => {
      const testEventId = "test_max_shares";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            1002, // Exceeds max of 1000
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with excessive shares");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Invalid share count");
      }
    });

    it("Accepts minimum valid shares", async () => {
      const testEventId = "test_min_shares";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          testEventId,
          question,
          2, // Minimum even number > 0
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const event = await program.account.event.fetch(testEventPDA);
      expect(event.maxSharesTotal).to.equal(2);
      expect(event.maxSharesYes).to.equal(1);
      expect(event.maxSharesNo).to.equal(1);
    });

    it("Accepts maximum valid shares", async () => {
      const testEventId = "test_exactly_max_shares";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          testEventId,
          question,
          1000, // Exactly max
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const event = await program.account.event.fetch(testEventPDA);
      expect(event.maxSharesTotal).to.equal(1000);
      expect(event.maxSharesYes).to.equal(500);
      expect(event.maxSharesNo).to.equal(500);
    });
  });

  describe("OPTA Odds Validation", () => {
    it("Rejects zero odds", async () => {
      const testEventId = "test_zero_odds";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            maxShares,
            0, // Zero odds
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with zero odds");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Invalid odds");
      }
    });

    it("Rejects odds of 10000 or higher", async () => {
      const testEventId = "test_max_odds";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            maxShares,
            10000, // 100% or higher (invalid)
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with odds too high");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Invalid odds");
      }
    });

    it("Accepts valid odds range", async () => {
      const validOdds = [1, 1000, 5000, 9000, 9999]; // 0.01% to 99.99%

      for (let i = 0; i < validOdds.length; i++) {
        const testEventId = `test_valid_odds_${i}`;
        const [testEventPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
          program.programId
        );
        const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
          program.programId
        );

        await program.methods
          .createEvent(
            testEventId,
            question,
            maxShares,
            validOdds[i],
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const event = await program.account.event.fetch(testEventPDA);
        expect(event.optaProbabilityYes + event.optaProbabilityNo).to.equal(10000);
      }
    });
  });

  describe("Timing Validation", () => {
    it("Rejects past timestamps", async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const testEventId = "test_past_event";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            maxShares,
            optaOddsYes,
            new anchor.BN(pastTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with past timestamp");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Match too soon");
      }
    });

    it("Rejects timestamps less than 24 hours in future", async () => {
      const nearFutureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const testEventId = "test_near_future_event";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            maxShares,
            optaOddsYes,
            new anchor.BN(nearFutureTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with insufficient future time");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Match too soon");
      }
    });
  });

  describe("Authorization and System State", () => {
    it("Rejects non-admin users", async () => {
      const unauthorizedUser = Keypair.generate();
      await provider.connection.requestAirdrop(
        unauthorizedUser.publicKey,
        2 * LAMPORTS_PER_SOL
      );

      const testEventId = "test_unauthorized_event";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            maxShares,
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: unauthorizedUser.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Should have failed with unauthorized access");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Unauthorized");
      }
    });

    it("Rejects when market doesn't exist", async () => {
      const nonExistentMarketId = "non_existent_market";
      const [nonExistentMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(nonExistentMarketId)],
        program.programId
      );

      const testEventId = "test_no_market";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(nonExistentMarketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      try {
        await program.methods
          .createEvent(
            testEventId,
            question,
            maxShares,
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: nonExistentMarketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with non-existent market");
      } catch (error) {
        expect(error.message).to.include("Account does not exist");
      }
    });
  });

  describe("Duplicate Prevention", () => {
    it("Prevents duplicate event creation", async () => {
      try {
        const [duplicateEventPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)], // Same as original
          program.programId
        );
        const [duplicateOrderBookPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
          program.programId
        );

        await program.methods
          .createEvent(
            eventId, // Same event ID as before
            question,
            maxShares,
            optaOddsYes,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: duplicateEventPDA,
            orderBook: duplicateOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with duplicate event");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("Price Calculation Verification", () => {
    it("Calculates prices correctly for different odds", async () => {
      const testCases = [
        { odds: 2500, expectedYesApprox: 0.25 }, // 25%
        { odds: 5000, expectedYesApprox: 0.50 }, // 50%
        { odds: 7500, expectedYesApprox: 0.75 }, // 75%
        { odds: 9000, expectedYesApprox: 0.90 }, // 90%
      ];

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const testEventId = `price_test_${i}`;
        const [testEventPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
          program.programId
        );
        const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
          program.programId
        );

        await program.methods
          .createEvent(
            testEventId,
            `Test question for ${testCase.odds} odds?`,
            maxShares,
            testCase.odds,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const event = await program.account.event.fetch(testEventPDA);
        
        // Verify total is exactly 1 SOL
        const totalPrice = event.yesSharePrice.toNumber() + event.noSharePrice.toNumber();
        expect(totalPrice).to.equal(LAMPORTS_PER_SOL);
        
        // Verify YES price is approximately correct (within 5% due to normalization)
        const actualYesPrice = event.yesSharePrice.toNumber() / LAMPORTS_PER_SOL;
        const priceDifference = Math.abs(actualYesPrice - testCase.expectedYesApprox);
        expect(priceDifference).to.be.lessThan(0.05);
        
        console.log(`Odds: ${testCase.odds}, Expected YES: ${testCase.expectedYesApprox}, Actual YES: ${actualYesPrice.toFixed(3)}`);
      }
    });

    it("Handles extreme odds correctly", async () => {
      const extremeOdds = [1, 9999]; // Very low and very high probabilities

      for (let i = 0; i < extremeOdds.length; i++) {
        const odds = extremeOdds[i];
        const testEventId = `extreme_odds_${i}`;
        const [testEventPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
          program.programId
        );
        const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
          program.programId
        );

        await program.methods
          .createEvent(
            testEventId,
            `Extreme odds test ${odds}?`,
            maxShares,
            odds,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: testEventPDA,
            orderBook: testOrderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const event = await program.account.event.fetch(testEventPDA);
        
        // Prices should still sum to 1 SOL
        const totalPrice = event.yesSharePrice.toNumber() + event.noSharePrice.toNumber();
        expect(totalPrice).to.equal(LAMPORTS_PER_SOL);
        
        // Both prices should be positive
        expect(event.yesSharePrice.toNumber()).to.be.greaterThan(0);
        expect(event.noSharePrice.toNumber()).to.be.greaterThan(0);
        
        // Probabilities should sum to 10000
        expect(event.optaProbabilityYes + event.optaProbabilityNo).to.equal(10000);
      }
    });
  });

  describe("Data Referential Integrity", () => {
    it("Maintains correct references between accounts", async () => {
      const testEventId = "test_integrity";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          testEventId,
          question,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const event = await program.account.event.fetch(testEventPDA);
      const market = await program.account.market.fetch(marketPDA);
      const orderBook = await program.account.orderBook.fetch(testOrderBookPDA);

      // Verify event references correct market
      expect(event.marketId).to.equal(market.marketId);
      expect(event.admin.toString()).to.equal(market.admin.toString());
      
      // Verify order book references correct event
      expect(orderBook.eventId).to.equal(event.eventId);
      
      // Verify timing relationships
      expect(event.primaryMarketClose.toNumber()).to.be.lessThan(event.secondaryMarketOpen.toNumber());
      expect(event.secondaryMarketOpen.toNumber()).to.be.lessThan(event.secondaryMarketClose.toNumber());
      expect(event.secondaryMarketOpen.toNumber()).to.equal(market.matchTimestamp.toNumber());
    });
  });

  describe("Account Management", () => {
    it("Creates accounts with correct PDAs and bumps", async () => {
      const testEventId = "test_pda_bumps";
      const [expectedEventPDA, expectedEventBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [expectedOrderBookPDA, expectedOrderBookBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          testEventId,
          question,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: expectedEventPDA,
          orderBook: expectedOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const event = await program.account.event.fetch(expectedEventPDA);
      const orderBook = await program.account.orderBook.fetch(expectedOrderBookPDA);
      
      expect(event.bump).to.equal(expectedEventBump);
      expect(orderBook.bump).to.equal(expectedOrderBookBump);
    });

    it("Accounts are rent exempt", async () => {
      const testEventId = "test_rent_exempt_event";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          testEventId,
          question,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Check event account
      const eventAccountInfo = await provider.connection.getAccountInfo(testEventPDA);
      const eventRentExempt = await provider.connection.getMinimumBalanceForRentExemption(
        eventAccountInfo!.data.length
      );
      expect(eventAccountInfo!.lamports).to.be.greaterThanOrEqual(eventRentExempt);

      // Check order book account
      const orderBookAccountInfo = await provider.connection.getAccountInfo(testOrderBookPDA);
      const orderBookRentExempt = await provider.connection.getMinimumBalanceForRentExemption(
        orderBookAccountInfo!.data.length
      );
      expect(orderBookAccountInfo!.lamports).to.be.greaterThanOrEqual(orderBookRentExempt);
    });
  });

  describe("Transaction Cost Analysis", () => {
    it("Records transaction costs for optimization", async () => {
      const testEventId = "test_cost_analysis_event";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      const balanceBefore = await provider.connection.getBalance(admin.publicKey);

      await program.methods
        .createEvent(
          testEventId,
          question,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const balanceAfter = await provider.connection.getBalance(admin.publicKey);
      const cost = (balanceBefore - balanceAfter) / LAMPORTS_PER_SOL;
      
      console.log(`Event creation cost: ${cost} SOL`);
      expect(cost).to.be.lessThan(0.01); // Should cost less than 0.01 SOL
    });
  });

  describe("Edge Cases and Special Scenarios", () => {
    it("Handles unicode characters in questions", async () => {
      const unicodeQuestion = "¿Ganará el Real Madrid? 🏆⚽";
      const testEventId = "test_unicode_question";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(testEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(testEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          testEventId,
          unicodeQuestion,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const event = await program.account.event.fetch(testEventPDA);
      expect(event.question).to.equal(unicodeQuestion);
    });

    it("Handles special characters in event IDs", async () => {
      const specialEventId = "will_team_win_2024_final";
      const [testEventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(specialEventId)],
        program.programId
      );
      const [testOrderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(specialEventId), Buffer.from("primary")],
        program.programId
      );

      await program.methods
        .createEvent(
          specialEventId,
          question,
          maxShares,
          optaOddsYes,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          event: testEventPDA,
          orderBook: testOrderBookPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const event = await program.account.event.fetch(testEventPDA);
      expect(event.eventId).to.equal(specialEventId);
    });
  });
});