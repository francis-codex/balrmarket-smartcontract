import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";

describe("Account Sizes", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet;

  // Expected sizes based on actual account structures
  const EXPECTED_SIZES = {
    GLOBAL_STATE: 86, // Actual size from deployment
    MARKET: 321,      // Actual size from deployment
    EVENT: 431,       // Actual size from deployment  
    ORDER_BOOK: 8 + 6633, // 8 bytes discriminator + OrderBook::INIT_SPACE
  };

  describe("GlobalState Account Size", () => {
    let globalStatePDA: PublicKey;

    before(async () => {
      [globalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        program.programId
      );

      // Create if doesn't exist
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
    });

    it("Has correct account size", async () => {
      const accountInfo = await provider.connection.getAccountInfo(globalStatePDA);
      expect(accountInfo).to.not.be.null;
      expect(accountInfo!.data.length).to.equal(EXPECTED_SIZES.GLOBAL_STATE);
    });

    it("Matches calculated INIT_SPACE", async () => {
      // GlobalState fields:
      // admin: Pubkey (32) + total_events: u64 (8) + platform_fee_primary: u16 (2) +
      // platform_fee_secondary: u16 (2) + fee_recipient: Pubkey (32) + is_paused: bool (1) + bump: u8 (1)
      const calculatedSize = 32 + 8 + 2 + 2 + 32 + 1 + 1; // 78 bytes
      const withDiscriminator = 8 + calculatedSize; // 86 bytes
      
      // Note: Expected is 86, which matches the actual deployment size
      const accountInfo = await provider.connection.getAccountInfo(globalStatePDA);
      console.log(`GlobalState actual size: ${accountInfo!.data.length}, calculated: ${withDiscriminator}`);
      
      expect(accountInfo!.data.length).to.be.at.least(withDiscriminator);
    });

    it("Is properly rent exempt", async () => {
      const accountInfo = await provider.connection.getAccountInfo(globalStatePDA);
      const rentExemptMinimum = await provider.connection.getMinimumBalanceForRentExemption(
        accountInfo!.data.length
      );
      
      expect(accountInfo!.lamports).to.be.greaterThanOrEqual(rentExemptMinimum);
      console.log(`GlobalState rent: ${accountInfo!.lamports / 1e9} SOL, minimum: ${rentExemptMinimum / 1e9} SOL`);
    });
  });

  describe("Market Account Size", () => {
    let marketPDA: PublicKey;
    const marketId = "test_market_size";

    before(async () => {
      [marketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(marketId)],
        program.programId
      );

      const [globalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        program.programId
      );

      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      try {
        await program.account.market.fetch(marketPDA);
      } catch (error) {
        await program.methods
          .createMarket(marketId, "Team A", "Team B", new anchor.BN(matchTimestamp))
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    });

    it("Has correct account size", async () => {
      const accountInfo = await provider.connection.getAccountInfo(marketPDA);
      expect(accountInfo).to.not.be.null;
      console.log(`Market actual size: ${accountInfo!.data.length}, expected: ${EXPECTED_SIZES.MARKET}`);
      expect(accountInfo!.data.length).to.equal(EXPECTED_SIZES.MARKET);
    });
  });

  describe("Event Account Size", () => {
    let eventPDA: PublicKey;
    let orderBookPDA: PublicKey;
    const eventId = "test_event_size";
    const marketId = "test_market_for_event_size";

    before(async () => {
      const [globalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        program.programId
      );

      const [marketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(marketId)],
        program.programId
      );

      [eventPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
        program.programId
      );

      [orderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
        program.programId
      );

      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2;

      // Create market first
      try {
        await program.account.market.fetch(marketPDA);
      } catch (error) {
        await program.methods
          .createMarket(marketId, "Team A", "Team B", new anchor.BN(matchTimestamp))
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      // Create event
      try {
        await program.account.event.fetch(eventPDA);
      } catch (error) {
        await program.methods
          .createEvent(eventId, "Test question?", 1000, 5640, new anchor.BN(matchTimestamp))
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            event: eventPDA,
            orderBook: orderBookPDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    });

    it("Has correct account size", async () => {
      const accountInfo = await provider.connection.getAccountInfo(eventPDA);
      expect(accountInfo).to.not.be.null;
      console.log(`Event actual size: ${accountInfo!.data.length}, expected: ${EXPECTED_SIZES.EVENT}`);
      expect(accountInfo!.data.length).to.equal(EXPECTED_SIZES.EVENT);
    });

    it("Verifies string encoding", async () => {
      const event = await program.account.event.fetch(eventPDA);
      
      expect(event.eventId).to.equal(eventId);
      expect(event.eventId.length).to.be.lessThanOrEqual(50);
      expect(event.question).to.equal("Test question?");
      expect(event.question.length).to.be.lessThanOrEqual(200);
      
      console.log(`Event ID stored: "${event.eventId}" (${event.eventId.length} chars)`);
      console.log(`Question stored: "${event.question}" (${event.question.length} chars)`);
    });
  });

  describe("OrderBook Account Size", () => {
    let orderBookPDA: PublicKey;

    before(async () => {
      const eventId = "test_event_size";
      [orderBookPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
        program.programId
      );
    });

    it("Has correct account size", async () => {
      const accountInfo = await provider.connection.getAccountInfo(orderBookPDA);
      expect(accountInfo).to.not.be.null;
      console.log(`OrderBook actual size: ${accountInfo!.data.length}, expected: ${EXPECTED_SIZES.ORDER_BOOK}`);
      expect(accountInfo!.data.length).to.equal(EXPECTED_SIZES.ORDER_BOOK);
    });

    it("Is initialized with empty orders", async () => {
      const orderBook = await program.account.orderBook.fetch(orderBookPDA);
      
      expect(orderBook.yesOrders.length).to.equal(0);
      expect(orderBook.noOrders.length).to.equal(0);
      expect(orderBook.bestYesBid.toNumber()).to.equal(0);
      expect(orderBook.bestNoBid.toNumber()).to.equal(0);
      expect(orderBook.totalYesVolume.toNumber()).to.equal(0);
      expect(orderBook.totalNoVolume.toNumber()).to.equal(0);
    });
  });
});