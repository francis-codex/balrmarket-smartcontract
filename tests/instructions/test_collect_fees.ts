import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";
import { createEvent, createGlobalState, createMarket } from "../utils/test_utils";

describe("collect_platform_fees", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet;

  let globalStateKeypair: anchor.web3.Keypair;
  let marketId: string;
  let eventId: string;
  let buyer1: anchor.web3.Keypair;
  let buyer2: anchor.web3.Keypair;

  beforeEach(async () => {
    // Initialize global state
    globalStateKeypair = anchor.web3.Keypair.generate();
    await createGlobalState(program, admin, globalStateKeypair, 200, 200); // 2% platform fee

    // Create market
    marketId = `market_${Date.now()}`;
    await createMarket(
      program,
      admin,
      marketId,
      "Team A",
      "Team B",
      Math.floor(Date.now() / 1000) + 86400
    );

    // Create event
    eventId = `event_${Date.now()}`;
    await createEvent(
      program,
      admin,
      globalStateKeypair.publicKey,
      marketId,
      eventId,
      "Will Team A win?",
      1000,
      5000,
      Math.floor(Date.now() / 1000) + 3600
    );

    // Create buyers
    buyer1 = anchor.web3.Keypair.generate();
    buyer2 = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to buyers
    for (const buyer of [buyer1, buyer2]) {
      const signature = await provider.connection.requestAirdrop(
        buyer.publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(signature);
    }
  });

  it("Should successfully collect platform fees after orders are matched", async () => {
    const orderId1 = Math.floor(Math.random() * 1000000);
    const orderId2 = Math.floor(Math.random() * 1000000);
    
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    const [order1Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), new anchor.BN(orderId1).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [escrow1Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), new anchor.BN(orderId1).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [order2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), new anchor.BN(orderId2).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [escrow2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), new anchor.BN(orderId2).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Place YES order
    await program.methods
      .placeOrder(
        new anchor.BN(orderId1),
        eventId,
        { yes: {} },
        new anchor.BN(100),
        new anchor.BN(anchor.web3.LAMPORTS_PER_SOL * 0.6) // 0.6 SOL per share
      )
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        order: order1Pda,
        escrowAccount: escrow1Pda,
        buyer: buyer1.publicKey,
        adminWallet: admin.publicKey,
      })
      .signers([buyer1])
      .rpc();

    // Place NO order
    await program.methods
      .placeOrder(
        new anchor.BN(orderId2),
        eventId,
        { no: {} },
        new anchor.BN(100),
        new anchor.BN(anchor.web3.LAMPORTS_PER_SOL * 0.4) // 0.4 SOL per share
      )
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        order: order2Pda,
        escrowAccount: escrow2Pda,
        buyer: buyer2.publicKey,
        adminWallet: admin.publicKey,
      })
      .signers([buyer2])
      .rpc();

    // Match the orders
    await program.methods
      .matchOrders(eventId, new anchor.BN(orderId1), new anchor.BN(orderId2))
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        yesOrder: order1Pda,
        noOrder: order2Pda,
        yesEscrow: escrow1Pda,
        noEscrow: escrow2Pda,
        yesBuyer: buyer1.publicKey,
        noBuyer: buyer2.publicKey,
      })
      .rpc();

    // End primary market
    await program.methods
      .endPrimaryMarket(eventId)
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        admin: admin.publicKey,
      })
      .rpc();

    // Get admin balance before collecting fees
    const adminBalanceBefore = await provider.connection.getBalance(admin.publicKey);

    // Collect platform fees
    await program.methods
      .collectPlatformFees(eventId)
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        admin: admin.publicKey,
        adminWallet: admin.publicKey,
      })
      .rpc();

    // Verify admin received fees
    const adminBalanceAfter = await provider.connection.getBalance(admin.publicKey);
    expect(adminBalanceAfter).to.be.greaterThan(adminBalanceBefore);

    // Verify event's total_platform_fees is reset to 0
    const updatedEvent = await program.account.event.fetch(eventPda);
    expect(updatedEvent.totalPlatformFees.toNumber()).to.equal(0);
  });

  it("Should fail to collect fees if not admin", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    // End primary market first
    await program.methods
      .endPrimaryMarket(eventId)
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        admin: admin.publicKey,
      })
      .rpc();

    try {
      await program.methods
        .collectPlatformFees(eventId)
        .accounts({
          globalState: globalStateKeypair.publicKey,
          event: eventPda,
          admin: nonAdmin.publicKey,
          adminWallet: nonAdmin.publicKey,
        })
        .signers([nonAdmin])
        .rpc();
      
      expect.fail("Should have failed with unauthorized error");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("Unauthorized");
    }
  });

  it("Should fail to collect fees if primary market not closed", async () => {
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    try {
      await program.methods
        .collectPlatformFees(eventId)
        .accounts({
          globalState: globalStateKeypair.publicKey,
          event: eventPda,
          admin: admin.publicKey,
          adminWallet: admin.publicKey,
        })
        .rpc();
      
      expect.fail("Should have failed with primary not closed error");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("PrimaryNotClosed");
    }
  });

  it("Should fail to collect fees if no fees to collect", async () => {
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    // End primary market
    await program.methods
      .endPrimaryMarket(eventId)
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        admin: admin.publicKey,
      })
      .rpc();

    try {
      await program.methods
        .collectPlatformFees(eventId)
        .accounts({
          globalState: globalStateKeypair.publicKey,
          event: eventPda,
          admin: admin.publicKey,
          adminWallet: admin.publicKey,
        })
        .rpc();
      
      expect.fail("Should have failed with no fees to collect error");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("NoFeesToCollect");
    }
  });
});