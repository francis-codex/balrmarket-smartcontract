import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";
import { createEvent, createGlobalState, createMarket } from "../utils/test_utils";

describe("refund_unmatched_orders", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet;

  let globalStateKeypair: anchor.web3.Keypair;
  let marketId: string;
  let eventId: string;
  let buyer: anchor.web3.Keypair;

  beforeEach(async () => {
    // Initialize global state
    globalStateKeypair = anchor.web3.Keypair.generate();
    await createGlobalState(program, admin, globalStateKeypair, 200, 200);

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

    // Create buyer
    buyer = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to buyer
    const signature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
  });

  it("Should successfully refund unmatched order after primary market closure", async () => {
    const orderId = Math.floor(Math.random() * 1000000);
    
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    const [orderPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), new anchor.BN(orderId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), new anchor.BN(orderId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Get initial buyer balance
    const initialBuyerBalance = await provider.connection.getBalance(buyer.publicKey);

    // Place an order
    await program.methods
      .placeOrder(
        new anchor.BN(orderId),
        eventId,
        { yes: {} },
        new anchor.BN(100),
        new anchor.BN(anchor.web3.LAMPORTS_PER_SOL * 0.6) // 0.6 SOL per share
      )
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        order: orderPda,
        escrowAccount: escrowPda,
        buyer: buyer.publicKey,
        adminWallet: admin.publicKey,
      })
      .signers([buyer])
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

    // Get balance before refund
    const balanceBeforeRefund = await provider.connection.getBalance(buyer.publicKey);

    // Refund the unmatched order
    await program.methods
      .refundUnmatchedOrders(eventId, new anchor.BN(orderId))
      .accounts({
        event: eventPda,
        order: orderPda,
        escrowAccount: escrowPda,
        buyer: buyer.publicKey,
      })
      .rpc();

    // Verify order status changed to refunded
    const updatedOrder = await program.account.order.fetch(orderPda);
    expect(updatedOrder.status).to.deep.equal({ refunded: {} });

    // Verify buyer received refund
    const balanceAfterRefund = await provider.connection.getBalance(buyer.publicKey);
    expect(balanceAfterRefund).to.be.greaterThan(balanceBeforeRefund);
  });

  it("Should fail to refund order if primary market not closed", async () => {
    const orderId = Math.floor(Math.random() * 1000000);
    
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    const [orderPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), new anchor.BN(orderId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), new anchor.BN(orderId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Place an order
    await program.methods
      .placeOrder(
        new anchor.BN(orderId),
        eventId,
        { yes: {} },
        new anchor.BN(100),
        new anchor.BN(anchor.web3.LAMPORTS_PER_SOL * 0.6)
      )
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        order: orderPda,
        escrowAccount: escrowPda,
        buyer: buyer.publicKey,
        adminWallet: admin.publicKey,
      })
      .signers([buyer])
      .rpc();

    // Try to refund without closing primary market first
    try {
      await program.methods
        .refundUnmatchedOrders(eventId, new anchor.BN(orderId))
        .accounts({
          event: eventPda,
          order: orderPda,
          escrowAccount: escrowPda,
          buyer: buyer.publicKey,
        })
        .rpc();
      
      expect.fail("Should have failed with primary not closed error");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("PrimaryNotClosed");
    }
  });

  it("Should fail to refund order that is not pending", async () => {
    const orderId = Math.floor(Math.random() * 1000000);
    
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    const [orderPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), new anchor.BN(orderId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), new anchor.BN(orderId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Place and cancel an order
    await program.methods
      .placeOrder(
        new anchor.BN(orderId),
        eventId,
        { yes: {} },
        new anchor.BN(100),
        new anchor.BN(anchor.web3.LAMPORTS_PER_SOL * 0.6)
      )
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        order: orderPda,
        escrowAccount: escrowPda,
        buyer: buyer.publicKey,
        adminWallet: admin.publicKey,
      })
      .signers([buyer])
      .rpc();

    // Cancel the order
    await program.methods
      .cancelOrder(new anchor.BN(orderId), eventId)
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        order: orderPda,
        escrowAccount: escrowPda,
        buyer: buyer.publicKey,
      })
      .signers([buyer])
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

    // Try to refund cancelled order
    try {
      await program.methods
        .refundUnmatchedOrders(eventId, new anchor.BN(orderId))
        .accounts({
          event: eventPda,
          order: orderPda,
          escrowAccount: escrowPda,
          buyer: buyer.publicKey,
        })
        .rpc();
      
      expect.fail("Should have failed with order not pending error");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("OrderNotPending");
    }
  });
});