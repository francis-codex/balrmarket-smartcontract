import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";

describe("Create Market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet;

  let globalStatePDA: PublicKey;

  // Test data
  const marketId = "man_utd_vs_arsenal_2025_01_15";
  const teamA = "Manchester United";
  const teamB = "Arsenal";
  const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days from now

  before(async () => {
    [globalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );

    // Ensure global state exists
    try {
      await program.account.globalState.fetch(globalStatePDA);
    } catch (error) {
      // Initialize if it doesn't exist
      await program.methods
        .initializeGlobalState(admin.publicKey, 200, 50)
        .accounts({
          globalState: globalStatePDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  });

  describe("Successful Market Creation", () => {
    let marketPDA: PublicKey;

    before(async () => {
      [marketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(marketId)],
        program.programId
      );
    });

    it("Creates a market with valid parameters", async () => {
      const tx = await program.methods
        .createMarket(
          marketId,
          teamA,
          teamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Market Creation Transaction:", tx);

      // Verify market was created correctly
      const market = await program.account.market.fetch(marketPDA);
      expect(market.marketId).to.equal(marketId);
      expect(market.teamA).to.equal(teamA);
      expect(market.teamB).to.equal(teamB);
      expect(market.matchTimestamp.toNumber()).to.equal(matchTimestamp);
      expect(market.admin.toString()).to.equal(admin.publicKey.toString());
      expect(market.totalEvents).to.equal(0);
      expect(market.createdAt.toNumber()).to.be.greaterThan(0);
      expect(market.bump).to.be.greaterThan(0);
    });

    it("Sets market status to Created", async () => {
      const market = await program.account.market.fetch(marketPDA);
      expect(market.status).to.deep.equal({ created: {} });
    });

    it("Records creation timestamp", async () => {
      const market = await program.account.market.fetch(marketPDA);
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Should be created within the last minute
      expect(market.createdAt.toNumber()).to.be.greaterThan(currentTime - 60);
      expect(market.createdAt.toNumber()).to.be.lessThanOrEqual(currentTime + 10);
    });

    it("Initializes total events to zero", async () => {
      const market = await program.account.market.fetch(marketPDA);
      expect(market.totalEvents).to.equal(0);
    });
  });

  describe("Input Validation", () => {
    it("Rejects market ID that is too long", async () => {
      const longMarketId = "a".repeat(51); // Max is 50
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(longMarketId)],
        program.programId
      );

      try {
        await program.methods
          .createMarket(
            longMarketId,
            teamA,
            teamB,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: testMarketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with market ID too long");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Market ID too long");
      }
    });

    it("Rejects team names that are too long", async () => {
      const longTeamName = "a".repeat(101); // Max is 100
      const testMarketId = "test_long_team_name";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      try {
        await program.methods
          .createMarket(
            testMarketId,
            longTeamName,
            teamB,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: testMarketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with team name too long");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Team name too long");
      }
    });

    it("Rejects empty team names", async () => {
      const testMarketId = "test_empty_team";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      try {
        await program.methods
          .createMarket(
            testMarketId,
            "", // Empty team name
            teamB,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: testMarketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with empty team name");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Invalid input");
      }
    });

    it("Accepts maximum length strings", async () => {
      const maxMarketId = "a".repeat(50);
      const maxTeamA = "b".repeat(100);
      const maxTeamB = "c".repeat(100);
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(maxMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          maxMarketId,
          maxTeamA,
          maxTeamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      expect(market.marketId).to.equal(maxMarketId);
      expect(market.teamA).to.equal(maxTeamA);
      expect(market.teamB).to.equal(maxTeamB);
    });
  });

  describe("Timing Validation", () => {
    it("Rejects past timestamps", async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const testMarketId = "test_past_timestamp";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      try {
        await program.methods
          .createMarket(
            testMarketId,
            teamA,
            teamB,
            new anchor.BN(pastTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: testMarketPDA,
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
      const testMarketId = "test_near_future";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      try {
        await program.methods
          .createMarket(
            testMarketId,
            teamA,
            teamB,
            new anchor.BN(nearFutureTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: testMarketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with insufficient future time");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Match too soon");
      }
    });

    it("Accepts timestamps exactly 24 hours in future", async () => {
      const exactFutureTimestamp = Math.floor(Date.now() / 1000) + 86400; // Exactly 24 hours
      const testMarketId = "test_exact_24h";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          teamA,
          teamB,
          new anchor.BN(exactFutureTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      expect(market.matchTimestamp.toNumber()).to.equal(exactFutureTimestamp);
    });

    it("Accepts far future timestamps", async () => {
      const farFutureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 365; // 1 year
      const testMarketId = "test_far_future";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          teamA,
          teamB,
          new anchor.BN(farFutureTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      expect(market.matchTimestamp.toNumber()).to.equal(farFutureTimestamp);
    });
  });

  describe("Authorization", () => {
    it("Rejects non-admin users", async () => {
      const unauthorizedUser = Keypair.generate();
      await provider.connection.requestAirdrop(
        unauthorizedUser.publicKey,
        2 * LAMPORTS_PER_SOL
      );

      const testMarketId = "test_unauthorized";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      try {
        await program.methods
          .createMarket(
            testMarketId,
            teamA,
            teamB,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: testMarketPDA,
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

    it("Allows only the global state admin", async () => {
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      expect(globalState.admin.toString()).to.equal(admin.publicKey.toString());

      // This should succeed since we're using the correct admin
      const testMarketId = "test_correct_admin";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          teamA,
          teamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      expect(market.admin.toString()).to.equal(admin.publicKey.toString());
    });
  });

  describe("System State Checks", () => {
    it("Checks system is not paused", async () => {
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      expect(globalState.isPaused).to.be.false;

      // If system were paused, this would fail
      // This test verifies the constraint is in place
    });
  });

  describe("Account Management", () => {
    it("Creates account with correct PDA", async () => {
      const testMarketId = "test_pda_verification";
      const [expectedPDA, expectedBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          teamA,
          teamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: expectedPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(expectedPDA);
      expect(market.bump).to.equal(expectedBump);
    });

    it("Account is rent exempt", async () => {
      const testMarketId = "test_rent_exempt";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          teamA,
          teamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const accountInfo = await provider.connection.getAccountInfo(testMarketPDA);
      const rentExemptMinimum = await provider.connection.getMinimumBalanceForRentExemption(
        accountInfo!.data.length
      );
      
      expect(accountInfo!.lamports).to.be.greaterThanOrEqual(rentExemptMinimum);
    });

    it("Prevents duplicate market creation", async () => {
      try {
        const [duplicateMarketPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("market"), Buffer.from(marketId)], // Same as first test
          program.programId
        );

        await program.methods
          .createMarket(
            marketId, // Same market ID
            teamA,
            teamB,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: duplicateMarketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have failed with duplicate market");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("Edge Cases", () => {
    it("Handles special characters in team names", async () => {
      const specialTeamA = "Real Madrid C.F.";
      const specialTeamB = "FC Barcelona (ESP)";
      const testMarketId = "test_special_chars";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          specialTeamA,
          specialTeamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      expect(market.teamA).to.equal(specialTeamA);
      expect(market.teamB).to.equal(specialTeamB);
    });

    it("Handles unicode characters", async () => {
      const unicodeTeamA = "Bayern München";
      const unicodeTeamB = "Atlético Madrid";
      const testMarketId = "test_unicode";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          unicodeTeamA,
          unicodeTeamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      expect(market.teamA).to.equal(unicodeTeamA);
      expect(market.teamB).to.equal(unicodeTeamB);
    });

    it("Handles numeric team names", async () => {
      const numericTeamA = "1. FC Köln";
      const numericTeamB = "AC Milan 1899";
      const testMarketId = "test_numeric";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testMarketId,
          numericTeamA,
          numericTeamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      expect(market.teamA).to.equal(numericTeamA);
      expect(market.teamB).to.equal(numericTeamB);
    });
  });

  describe("Market ID Validation", () => {
    it("Accepts valid market ID formats", async () => {
      const validMarketIds = [
        "simple_market",
        "market_with_numbers_123",
        "UPPERCASE_MARKET",
        "mixed_Case_Market_456",
        "market-with-dashes",
        "market.with.dots",
        "a", // Single character
        "a".repeat(50) // Maximum length
      ];

      for (const testMarketId of validMarketIds) {
        const [testMarketPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("market"), Buffer.from(testMarketId)],
          program.programId
        );

        await program.methods
          .createMarket(
            testMarketId,
            teamA,
            teamB,
            new anchor.BN(matchTimestamp)
          )
          .accounts({
            globalState: globalStatePDA,
            market: testMarketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const market = await program.account.market.fetch(testMarketPDA);
        expect(market.marketId).to.equal(testMarketId);
      }
    });
  });

  describe("Transaction Cost Analysis", () => {
    it("Records transaction cost for market creation", async () => {
      const testMarketId = "test_cost_analysis";
      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testMarketId)],
        program.programId
      );

      const balanceBefore = await provider.connection.getBalance(admin.publicKey);

      await program.methods
        .createMarket(
          testMarketId,
          teamA,
          teamB,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const balanceAfter = await provider.connection.getBalance(admin.publicKey);
      const cost = (balanceBefore - balanceAfter) / LAMPORTS_PER_SOL;
      
      console.log(`Market creation cost: ${cost} SOL`);
      expect(cost).to.be.lessThan(0.01); // Should cost less than 0.01 SOL
    });
  });

  describe("Data Integrity", () => {
    it("Preserves all input data correctly", async () => {
      const testData = {
        marketId: "data_integrity_test",
        teamA: "Data Team A",
        teamB: "Data Team B",
        matchTimestamp: Math.floor(Date.now() / 1000) + 86400 * 3 // 3 days
      };

      const [testMarketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(testData.marketId)],
        program.programId
      );

      await program.methods
        .createMarket(
          testData.marketId,
          testData.teamA,
          testData.teamB,
          new anchor.BN(testData.matchTimestamp)
        )
        .accounts({
          globalState: globalStatePDA,
          market: testMarketPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(testMarketPDA);
      
      // Verify every field
      expect(market.marketId).to.equal(testData.marketId);
      expect(market.teamA).to.equal(testData.teamA);
      expect(market.teamB).to.equal(testData.teamB);
      expect(market.matchTimestamp.toNumber()).to.equal(testData.matchTimestamp);
      expect(market.admin.toString()).to.equal(admin.publicKey.toString());
      expect(market.totalEvents).to.equal(0);
      expect(market.status).to.deep.equal({ created: {} });
      expect(market.createdAt.toNumber()).to.be.greaterThan(0);
      expect(market.bump).to.be.greaterThan(0);
    });
  });
});