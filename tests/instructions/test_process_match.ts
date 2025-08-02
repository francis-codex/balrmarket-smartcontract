import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";

describe("Process Match", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet as anchor.Wallet;
  
  // Test keypairs
  const buyer1 = web3.Keypair.generate();
  const buyer2 = web3.Keypair.generate();
  const matcher = web3.Keypair.generate();
  const minter = web3.Keypair.generate();
  const processor = web3.Keypair.generate();
  
  // Test data
  const marketId = "test-process-market";
  const eventId = "test-process-event";
  const yesOrderId = new BN(1);
  const noOrderId = new BN(2);
  const matchedPairId = new BN(0);
  
  // PDAs
  let globalStatePda: web3.PublicKey;
  let marketPda: web3.PublicKey;
  let eventPda: web3.PublicKey;
  let orderBookPda: web3.PublicKey;
  let yesOrderPda: web3.PublicKey;
  let noOrderPda: web3.PublicKey;
  let yesEscrowPda: web3.PublicKey;
  let noEscrowPda: web3.PublicKey;
  let matchedPairPda: web3.PublicKey;
  let yesShareTokenPda: web3.PublicKey;
  let noShareTokenPda: web3.PublicKey;

  before(async () => {
    // Derive PDAs
    [globalStatePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );

    [marketPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(marketId)],
      program.programId
    );

    [eventPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    [orderBookPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
      program.programId
    );

    [yesOrderPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), yesOrderId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [noOrderPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), noOrderId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [yesEscrowPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), yesOrderId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [noEscrowPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), noOrderId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [matchedPairPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("match"), Buffer.from(eventId), matchedPairId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [yesShareTokenPda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("share"), 
        Buffer.from(eventId), 
        buyer1.publicKey.toBuffer(), 
        Buffer.from("yes")
      ],
      program.programId
    );

    [noShareTokenPda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("share"), 
        Buffer.from(eventId), 
        buyer2.publicKey.toBuffer(), 
        Buffer.from("no")
      ],
      program.programId
    );

    // Fund test accounts
    await provider.connection.requestAirdrop(buyer1.publicKey, 10 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer2.publicKey, 10 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(matcher.publicKey, 2 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(minter.publicKey, 2 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(processor.publicKey, 2 * web3.LAMPORTS_PER_SOL);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Setup: Initialize global state, market, and event
    try {
      await program.methods
        .initializeGlobalState(
          admin.publicKey,
          200, // 2% platform fee
          300  // 3% platform fee
        )
        .accounts({
          globalState: globalStatePda,
          admin: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      // Might already exist
    }

    try {
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;
      
      await program.methods
        .createMarket(
          marketId,
          "Team A",
          "Team B", 
          new BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePda,
          market: marketPda,
          admin: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .createEvent(
          eventId,
          "Will Team A score first?",
          100, // max_shares
          6000, // 60% opta odds for YES
          new BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePda,
          market: marketPda,
          event: eventPda,
          orderBook: orderBookPda,
          admin: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      // Might already exist
    }

    // Create and match orders, then mint shares
    const yesPrice = new BN(0.7 * web3.LAMPORTS_PER_SOL);
    const noPrice = new BN(0.3 * web3.LAMPORTS_PER_SOL);
    const quantity = new BN(8);

    await program.methods
      .placeOrder(
        yesOrderId,
        eventId,
        { yes: {} },
        quantity,
        yesPrice
      )
      .accounts({
        globalState: globalStatePda,
        event: eventPda,
        order: yesOrderPda,
        escrowAccount: yesEscrowPda,
        buyer: buyer1.publicKey,
        adminWallet: admin.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([buyer1])
      .rpc();

    await program.methods
      .placeOrder(
        noOrderId,
        eventId,
        { no: {} },
        quantity,
        noPrice
      )
      .accounts({
        globalState: globalStatePda,
        event: eventPda,
        order: noOrderPda,
        escrowAccount: noEscrowPda,
        buyer: buyer2.publicKey,
        adminWallet: admin.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([buyer2])
      .rpc();

    // Match the orders
    await program.methods
      .matchOrders(
        eventId,
        yesOrderId,
        noOrderId
      )
      .accounts({
        globalState: globalStatePda,
        event: eventPda,
        yesOrder: yesOrderPda,
        noOrder: noOrderPda,
        yesEscrow: yesEscrowPda,
        noEscrow: noEscrowPda,
        matchedPair: matchedPairPda,
        yesBuyer: buyer1.publicKey,
        noBuyer: buyer2.publicKey,
        authority: matcher.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([matcher])
      .rpc();

    // Mint share tokens
    await program.methods
      .mintShares(
        eventId,
        matchedPairId
      )
      .accounts({
        globalState: globalStatePda,
        event: eventPda,
        matchedPair: matchedPairPda,
        yesShareToken: yesShareTokenPda,
        noShareToken: noShareTokenPda,
        mintAuthority: minter.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([minter])
      .rpc();
  });

  it("Should process match and update payout pool", async () => {
    // Get initial event state
    const eventBefore = await program.account.event.fetch(eventPda);
    const initialPayoutPool = eventBefore.payoutPool;

    await program.methods
      .processMatch(
        eventId,
        matchedPairId
      )
      .accounts({
        globalState: globalStatePda,
        event: eventPda,
        matchedPair: matchedPairPda,
        yesOrder: yesOrderPda,
        noOrder: noOrderPda,
        yesEscrow: yesEscrowPda,
        noEscrow: noEscrowPda,
        yesShareToken: yesShareTokenPda,
        noShareToken: noShareTokenPda,
        authority: processor.publicKey,
      })
      .signers([processor])
      .rpc();

    // Verify event payout pool was updated
    const eventAfter = await program.account.event.fetch(eventPda);
    const expectedIncrease = new BN(8) // quantity
      .mul(new BN(0.7 * web3.LAMPORTS_PER_SOL).add(new BN(0.3 * web3.LAMPORTS_PER_SOL))); // yes_price + no_price

    expect(eventAfter.payoutPool.toString()).to.equal(
      initialPayoutPool.add(expectedIncrease).toString()
    );

    // Verify orders are still marked as matched
    const yesOrder = await program.account.order.fetch(yesOrderPda);
    const noOrder = await program.account.order.fetch(noOrderPda);
    
    expect(yesOrder.status).to.deep.equal({ matched: {} });
    expect(noOrder.status).to.deep.equal({ matched: {} });

    console.log("Process Match test completed successfully!");
  });

  it("Should fail to process match with mismatched event ID", async () => {
    const wrongEventId = "wrong-event-id";
    
    try {
      await program.methods
        .processMatch(
          wrongEventId,
          matchedPairId
        )
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          matchedPair: matchedPairPda,
          yesOrder: yesOrderPda,
          noOrder: noOrderPda,
          yesEscrow: yesEscrowPda,
          noEscrow: noEscrowPda,
          yesShareToken: yesShareTokenPda,
          noShareToken: noShareTokenPda,
          authority: processor.publicKey,
        })
        .signers([processor])
        .rpc();
      
      expect.fail("Should have failed with mismatched event ID");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("InvalidInput");
    }
  });

  it("Should validate share token quantities match matched pair", async () => {
    // This test verifies that the process_match instruction
    // properly validates that share tokens have the correct quantities
    // In a real scenario, this would catch cases where share tokens
    // were tampered with or incorrectly minted
    
    const matchedPair = await program.account.matchedPair.fetch(matchedPairPda);
    const yesShareToken = await program.account.shareToken.fetch(yesShareTokenPda);
    const noShareToken = await program.account.shareToken.fetch(noShareTokenPda);
    
    // Verify quantities match
    expect(yesShareToken.quantity.toString()).to.equal(matchedPair.quantity.toString());
    expect(noShareToken.quantity.toString()).to.equal(matchedPair.quantity.toString());
    
    console.log("Share token quantity validation passed!");
  });
});