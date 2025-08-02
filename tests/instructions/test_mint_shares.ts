import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";

describe("Mint Shares", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet as anchor.Wallet;
  
  // Test keypairs
  const buyer1 = web3.Keypair.generate();
  const buyer2 = web3.Keypair.generate();
  const matcher = web3.Keypair.generate();
  const minter = web3.Keypair.generate();
  
  // Test data
  const marketId = "test-mint-market";
  const eventId = "test-mint-event";
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

    // Fund test accounts
    await provider.connection.requestAirdrop(buyer1.publicKey, 10 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer2.publicKey, 10 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(matcher.publicKey, 2 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(minter.publicKey, 2 * web3.LAMPORTS_PER_SOL);
    
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

    // Create and match orders first
    const yesPrice = new BN(0.6 * web3.LAMPORTS_PER_SOL);
    const noPrice = new BN(0.4 * web3.LAMPORTS_PER_SOL);
    const quantity = new BN(5);

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

    // Derive share token PDAs
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
  });

  it("Should mint share tokens for matched orders", async () => {
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

    // Verify YES share token
    const yesShareToken = await program.account.shareToken.fetch(yesShareTokenPda);
    expect(yesShareToken.eventId).to.equal(eventId);
    expect(yesShareToken.owner.toString()).to.equal(buyer1.publicKey.toString());
    expect(yesShareToken.shareType).to.deep.equal({ yes: {} });
    expect(yesShareToken.quantity.toString()).to.equal("5");
    expect(yesShareToken.mintAuthority.toString()).to.equal(minter.publicKey.toString());

    // Verify NO share token
    const noShareToken = await program.account.shareToken.fetch(noShareTokenPda);
    expect(noShareToken.eventId).to.equal(eventId);
    expect(noShareToken.owner.toString()).to.equal(buyer2.publicKey.toString());
    expect(noShareToken.shareType).to.deep.equal({ no: {} });
    expect(noShareToken.quantity.toString()).to.equal("5");
    expect(noShareToken.mintAuthority.toString()).to.equal(minter.publicKey.toString());

    console.log("Mint Shares test completed successfully!");
  });

  it("Should fail to mint shares for non-existent matched pair", async () => {
    const fakeMatchedPairId = new BN(999);
    const [fakeMatchedPairPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("match"), Buffer.from(eventId), fakeMatchedPairId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [fakeYesSharePda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("share"), 
        Buffer.from(eventId), 
        buyer1.publicKey.toBuffer(), 
        Buffer.from("yes")
      ],
      program.programId
    );

    const [fakeNoSharePda] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("share"), 
        Buffer.from(eventId), 
        buyer2.publicKey.toBuffer(), 
        Buffer.from("no")
      ],
      program.programId
    );

    try {
      await program.methods
        .mintShares(
          eventId,
          fakeMatchedPairId
        )
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          matchedPair: fakeMatchedPairPda,
          yesShareToken: fakeYesSharePda,
          noShareToken: fakeNoSharePda,
          mintAuthority: minter.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([minter])
        .rpc();
      
      expect.fail("Should have failed with non-existent matched pair");
    } catch (error) {
      // Should fail because the matched pair account doesn't exist
      expect(error.message).to.include("AccountNotInitialized");
    }
  });
});