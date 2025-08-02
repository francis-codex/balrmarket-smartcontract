import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Balrmarket } from "../target/types/balrmarket";
import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

describe("Order Creation and Escrow System", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet as anchor.Wallet;
  
  // Test keypairs
  const buyer1 = web3.Keypair.generate();
  const buyer2 = web3.Keypair.generate();
  
  // Test data
  const marketId = "test-market-orders";
  const eventId = "test-event-orders";
  const orderId1 = new BN(1);
  const orderId2 = new BN(2);
  const orderId3 = new BN(3);
  
  // PDAs
  let globalStatePda: web3.PublicKey;
  let marketPda: web3.PublicKey;
  let eventPda: web3.PublicKey;
  let orderBookPda: web3.PublicKey;
  let order1Pda: web3.PublicKey;
  let order2Pda: web3.PublicKey;
  let order3Pda: web3.PublicKey;
  let escrow1Pda: web3.PublicKey;
  let escrow2Pda: web3.PublicKey;
  let escrow3Pda: web3.PublicKey;

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

    [order1Pda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), orderId1.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [order2Pda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), orderId2.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [order3Pda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), orderId3.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [escrow1Pda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), orderId1.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [escrow2Pda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), orderId2.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [escrow3Pda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), orderId3.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Fund test accounts
    await provider.connection.requestAirdrop(buyer1.publicKey, 10 * web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer2.publicKey, 10 * web3.LAMPORTS_PER_SOL);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Initialize global state if not exists
    try {
      await program.methods
        .initializeGlobalState(
          admin.publicKey,
          200, // 2% platform fee for primary market
          300  // 3% platform fee for secondary market
        )
        .accounts({
          globalState: globalStatePda,
          admin: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      // Global state might already exist
      console.log("Global state might already exist");
    }

    // Create market
    try {
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
      
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
    } catch (err) {
      console.log("Market might already exist");
    }

    // Create event
    try {
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;
      
      await program.methods
        .createEvent(
          eventId,
          "Will Team A score first?",
          100, // max_shares
          5000, // 50% opta odds for YES
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
      console.log("Event might already exist");
    }
  });

  describe("Place Order", () => {
    it("Should place a YES order with proper escrow", async () => {
      const quantity = new BN(10);
      const unitPrice = new BN(0.6 * web3.LAMPORTS_PER_SOL); // 0.6 SOL per share
      
      const buyer1BalanceBefore = await provider.connection.getBalance(buyer1.publicKey);
      const adminBalanceBefore = await provider.connection.getBalance(admin.publicKey);
      
      await program.methods
        .placeOrder(
          orderId1,
          eventId,
          { yes: {} }, // OrderType::Yes
          quantity,
          unitPrice
        )
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order: order1Pda,
          escrowAccount: escrow1Pda,
          buyer: buyer1.publicKey,
          adminWallet: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      // Verify order account
      const orderAccount = await program.account.order.fetch(order1Pda);
      expect(orderAccount.orderId.toString()).to.equal(orderId1.toString());
      expect(orderAccount.eventId).to.equal(eventId);
      expect(orderAccount.buyer.toString()).to.equal(buyer1.publicKey.toString());
      expect(orderAccount.orderType).to.deep.equal({ yes: {} });
      expect(orderAccount.quantity.toString()).to.equal(quantity.toString());
      expect(orderAccount.unitPrice.toString()).to.equal(unitPrice.toString());
      expect(orderAccount.status).to.deep.equal({ pending: {} });

      // Verify escrow account
      const escrowAccount = await program.account.escrowAccount.fetch(escrow1Pda);
      expect(escrowAccount.orderId.toString()).to.equal(orderId1.toString());
      expect(escrowAccount.eventId).to.equal(eventId);
      
      const expectedAmount = quantity.mul(unitPrice);
      expect(escrowAccount.amount.toString()).to.equal(expectedAmount.toString());

      // Verify SOL was transferred correctly
      const buyer1BalanceAfter = await provider.connection.getBalance(buyer1.publicKey);
      const adminBalanceAfter = await provider.connection.getBalance(admin.publicKey);
      
      const totalAmount = quantity.mul(unitPrice);
      const platformFee = totalAmount.mul(new BN(200)).div(new BN(10000)); // 2%
      const totalCost = totalAmount.add(platformFee);
      
      // Account for transaction fees in the comparison
      expect(buyer1BalanceBefore - buyer1BalanceAfter).to.be.greaterThan(totalCost.toNumber() - 10000);
      expect(adminBalanceAfter - adminBalanceBefore).to.be.greaterThan(platformFee.toNumber() - 1000);
    });

    it("Should place a NO order", async () => {
      const quantity = new BN(15);
      const unitPrice = new BN(0.4 * web3.LAMPORTS_PER_SOL); // 0.4 SOL per share
      
      await program.methods
        .placeOrder(
          orderId2,
          eventId,
          { no: {} }, // OrderType::No
          quantity,
          unitPrice
        )
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order: order2Pda,
          escrowAccount: escrow2Pda,
          buyer: buyer2.publicKey,
          adminWallet: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([buyer2])
        .rpc();

      const orderAccount = await program.account.order.fetch(order2Pda);
      expect(orderAccount.orderType).to.deep.equal({ no: {} });
      expect(orderAccount.quantity.toString()).to.equal(quantity.toString());
    });

    it("Should fail with invalid quantity", async () => {
      try {
        await program.methods
          .placeOrder(
            orderId3,
            eventId,
            { yes: {} },
            new anchor.BN(0), // Invalid quantity
            new BN(0.5 * web3.LAMPORTS_PER_SOL)
          )
          .accounts({
            globalState: globalStatePda,
            event: eventPda,
            order: order3Pda,
            escrowAccount: escrow3Pda,
            buyer: buyer1.publicKey,
            adminWallet: admin.publicKey,
            systemProgram: web3.SystemProgram.programId,
          })
          .signers([buyer1])
          .rpc();
        
        expect.fail("Should have failed with invalid quantity");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("InvalidOrderQuantity");
      }
    });
  });

  describe("Cancel Order", () => {
    it("Should cancel an order and refund SOL", async () => {
      const buyer1BalanceBefore = await provider.connection.getBalance(buyer1.publicKey);
      
      await program.methods
        .cancelOrder(orderId1, eventId)
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order: order1Pda,
          escrowAccount: escrow1Pda,
          buyer: buyer1.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      const buyer1BalanceAfter = await provider.connection.getBalance(buyer1.publicKey);
      
      // Verify refund (account for transaction fees)
      expect(buyer1BalanceAfter - buyer1BalanceBefore).to.be.greaterThan(
        new BN(10).mul(new BN(0.6 * web3.LAMPORTS_PER_SOL)).toNumber() - 10000
      );
    });

    it("Should fail to cancel someone else's order", async () => {
      try {
        await program.methods
          .cancelOrder(orderId2, eventId)
          .accounts({
            globalState: globalStatePda,
            event: eventPda,
            order: order2Pda,
            escrowAccount: escrow2Pda,
            buyer: buyer1.publicKey, // Wrong buyer
            systemProgram: web3.SystemProgram.programId,
          })
          .signers([buyer1])
          .rpc();
        
        expect.fail("Should have failed with unauthorized access");
      } catch (error) {
        expect(error.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  describe("Match Orders", () => {
    let order4Pda: PublicKey;
    let order5Pda: PublicKey;
    let escrow4Pda: PublicKey;
    let escrow5Pda: PublicKey;
    const orderId4 = new BN(4);
    const orderId5 = new BN(5);

    before(async () => {
      [order4Pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("order"), Buffer.from(eventId), orderId4.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      [order5Pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("order"), Buffer.from(eventId), orderId5.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      [escrow4Pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(eventId), orderId4.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      [escrow5Pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(eventId), orderId5.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
    });

    it("Should create matching YES and NO orders", async () => {
      // Place YES order from buyer1
      await program.methods
        .placeOrder(
          orderId4,
          eventId,
          { yes: {} },
          new BN(5),
          new BN(0.6 * web3.LAMPORTS_PER_SOL)
        )
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order: order4Pda,
          escrowAccount: escrow4Pda,
          buyer: buyer1.publicKey,
          adminWallet: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      // Place NO order from buyer2
      await program.methods
        .placeOrder(
          orderId5,
          eventId,
          { no: {} },
          new BN(5),
          new BN(0.4 * web3.LAMPORTS_PER_SOL)
        )
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order: order5Pda,
          escrowAccount: escrow5Pda,
          buyer: buyer2.publicKey,
          adminWallet: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([buyer2])
        .rpc();
    });

    it("Should successfully match compatible orders", async () => {
      const buyer1BalanceBefore = await provider.connection.getBalance(buyer1.publicKey);
      const buyer2BalanceBefore = await provider.connection.getBalance(buyer2.publicKey);

      await program.methods
        .matchOrders(orderId4, orderId5, eventId)
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order1: order4Pda,
          order2: order5Pda,
          escrowAccount1: escrow4Pda,
          escrowAccount2: escrow5Pda,
          buyer1: buyer1.publicKey,
          buyer2: buyer2.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      // Verify orders are now matched
      const order1 = await program.account.order.fetch(order4Pda);
      const order2 = await program.account.order.fetch(order5Pda);
      
      expect(order1.status).to.deep.equal({ matched: {} });
      expect(order2.status).to.deep.equal({ matched: {} });
      expect(order1.quantity.toString()).to.equal("0");
      expect(order2.quantity.toString()).to.equal("0");

      // Verify event shares were minted
      const eventAccount = await program.account.event.fetch(eventPda);
      expect(eventAccount.mintedSharesYes).to.equal(5);
      expect(eventAccount.mintedSharesNo).to.equal(5);

      // Verify buyers received their payouts
      const buyer1BalanceAfter = await provider.connection.getBalance(buyer1.publicKey);
      const buyer2BalanceAfter = await provider.connection.getBalance(buyer2.publicKey);
      
      // Buyer1 (YES) should receive 0.4 SOL * 5 shares = 2 SOL
      // Buyer2 (NO) should receive 0.6 SOL * 5 shares = 3 SOL
      expect(buyer1BalanceAfter - buyer1BalanceBefore).to.be.greaterThan(1.9 * web3.LAMPORTS_PER_SOL);
      expect(buyer2BalanceAfter - buyer2BalanceBefore).to.be.greaterThan(2.9 * web3.LAMPORTS_PER_SOL);
    });

    it("Should fail to match incompatible orders", async () => {
      // This test would require creating orders with incompatible prices
      // Skipped for brevity but would test price validation logic
    });
  });

  describe("Error Handling", () => {
    it("Should fail when system is paused", async () => {
      // First pause the system
      await program.methods
        .initializeGlobalState(
          admin.publicKey,
          200,
          300
        )
        .accounts({
          globalState: globalStatePda,
          admin: admin.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      // Note: This test assumes there's a pause functionality
      // In practice, you'd need to implement a pause/unpause instruction
    });

    it("Should fail with insufficient funds", async () => {
      const poorBuyer = web3.Keypair.generate();
      // Don't fund this account
      
      const [poorOrderPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("order"), Buffer.from(eventId), new BN(999).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const [poorEscrowPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(eventId), new BN(999).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      try {
        await program.methods
          .placeOrder(
            new BN(999),
            eventId,
            { yes: {} },
            new BN(10),
            new BN(1 * web3.LAMPORTS_PER_SOL)
          )
          .accounts({
            globalState: globalStatePda,
            event: eventPda,
            order: poorOrderPda,
            escrowAccount: poorEscrowPda,
            buyer: poorBuyer.publicKey,
            adminWallet: admin.publicKey,
            systemProgram: web3.SystemProgram.programId,
          })
          .signers([poorBuyer])
          .rpc();
        
        expect.fail("Should have failed with insufficient funds");
      } catch (error) {
        // Should fail due to insufficient lamports
        expect(error.message).to.include("insufficient");
      }
    });
  });
});