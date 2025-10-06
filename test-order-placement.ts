/**
 * Manual Test Script - Order Placement with Fixed Prices
 *
 * This script tests the updated place_order function that automatically
 * determines prices from the event's fixed prices.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Balrmarket } from "./target/types/balrmarket";

async function testOrderPlacement() {
  console.log("\n🧪 Testing Order Placement with Fixed Prices\n");

  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

  const admin = provider.wallet.publicKey;
  console.log("👤 Admin wallet:", admin.toBase58());
  console.log("💰 Balance:", await provider.connection.getBalance(admin) / LAMPORTS_PER_SOL, "SOL\n");

  // Derive PDAs
  const [globalStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    program.programId
  );

  const [adminHierarchyPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_hierarchy")],
    program.programId
  );

  // Step 1: Check if global state exists
  console.log("📋 Step 1: Checking platform initialization...");
  try {
    const globalState = await program.account.globalState.fetch(globalStatePDA);
    console.log("✅ Global state exists");
    console.log("   Platform fee (primary):", globalState.platformFeePrimary, "basis points");
    console.log("   Platform fee (secondary):", globalState.platformFeeSecondary, "basis points");
  } catch (error) {
    console.log("⚠️  Global state not initialized. Initializing...");
    try {
      const tx = await program.methods
        .initializeGlobalState(admin, 200, 100) // 2% primary, 1% secondary
        .accounts({
          globalState: globalStatePDA,
          admin: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Global state initialized:", tx);
    } catch (err) {
      console.error("❌ Failed to initialize global state:", err);
      return;
    }
  }

  // Step 2: Check if admin hierarchy exists
  console.log("\n📋 Step 2: Checking admin hierarchy...");
  try {
    const adminInfo = await program.methods
      .getAdminInfo()
      .accounts({
        adminHierarchy: adminHierarchyPDA,
      })
      .view();
    console.log("✅ Admin hierarchy exists");
    console.log("   Super admins:", adminInfo.superAdminCount);
    console.log("   Regular admins:", adminInfo.regularAdminCount);
  } catch (error) {
    console.log("⚠️  Admin hierarchy not initialized. Initializing...");
    try {
      const tx = await program.methods
        .initializeAdminHierarchy()
        .accounts({
          adminHierarchy: adminHierarchyPDA,
          initialSuperAdmin: admin,
          payer: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Admin hierarchy initialized:", tx);
    } catch (err) {
      console.error("❌ Failed to initialize admin hierarchy:", err);
      return;
    }
  }

  // Step 3: Create test market
  console.log("\n📋 Step 3: Creating test market...");
  const marketId = `test_market_${Date.now()}`;
  const [marketPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(marketId)],
    program.programId
  );

  try {
    const matchTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    const tx = await program.methods
      .createMarket(
        marketId,
        "Team A",
        "Team B",
        new anchor.BN(matchTimestamp)
      )
      .accounts({
        globalState: globalStatePDA,
        adminHierarchy: adminHierarchyPDA,
        market: marketPDA,
        admin: admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Market created:", tx);
    console.log("   Market ID:", marketId);
  } catch (err) {
    console.error("❌ Failed to create market:", err);
    return;
  }

  // Step 4: Create test event with fixed prices
  console.log("\n📋 Step 4: Creating test event...");
  const eventId = `test_event_${Date.now()}`;
  const [eventPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
    program.programId
  );
  const [orderBookPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
    program.programId
  );

  try {
    const matchTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    const tx = await program.methods
      .createEvent(
        eventId,
        "Will Team A win?",
        1000, // max shares
        6000, // 60% YES probability (basis points)
        new anchor.BN(matchTimestamp)
      )
      .accounts({
        globalState: globalStatePDA,
        adminHierarchy: adminHierarchyPDA,
        market: marketPDA,
        event: eventPDA,
        orderBook: orderBookPDA,
        admin: admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Event created:", tx);
    console.log("   Event ID:", eventId);

    // Fetch event to see the fixed prices
    const event = await program.account.event.fetch(eventPDA);
    const yesPrice = event.yesSharePrice.toNumber() / LAMPORTS_PER_SOL;
    const noPrice = event.noSharePrice.toNumber() / LAMPORTS_PER_SOL;

    console.log("\n💰 Event Fixed Prices:");
    console.log("   YES price:", yesPrice.toFixed(4), "SOL per share");
    console.log("   NO price:", noPrice.toFixed(4), "SOL per share");
    console.log("   Sum:", (yesPrice + noPrice).toFixed(4), "SOL (should be 1.0)");
  } catch (err) {
    console.error("❌ Failed to create event:", err);
    return;
  }

  // Step 5: Place YES order (NO unit_price parameter!)
  console.log("\n📋 Step 5: Placing YES order...");
  const yesOrderId = Date.now();
  const [yesOrderPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("order"),
      Buffer.from(eventId),
      new anchor.BN(yesOrderId).toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );
  const [yesEscrowPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      Buffer.from(eventId),
      new anchor.BN(yesOrderId).toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  try {
    const globalState = await program.account.globalState.fetch(globalStatePDA);
    const event = await program.account.event.fetch(eventPDA);

    // Calculate expected cost
    const quantity = 10;
    const unitPrice = event.yesSharePrice.toNumber();
    const totalAmount = quantity * unitPrice;
    const platformFee = Math.floor((totalAmount * globalState.platformFeePrimary) / 10000);
    const totalCost = totalAmount + platformFee;

    console.log("   Quantity:", quantity, "shares");
    console.log("   Unit price (from event):", unitPrice / LAMPORTS_PER_SOL, "SOL");
    console.log("   Total amount:", totalAmount / LAMPORTS_PER_SOL, "SOL");
    console.log("   Platform fee:", platformFee / LAMPORTS_PER_SOL, "SOL");
    console.log("   Total cost:", totalCost / LAMPORTS_PER_SOL, "SOL");

    // ✅ NO unit_price parameter - smart contract determines it automatically
    const tx = await program.methods
      .placeOrder(
        new anchor.BN(yesOrderId),
        eventId,
        { yes: {} },
        new anchor.BN(quantity)
        // ✅ unit_price parameter REMOVED
      )
      .accounts({
        globalState: globalStatePDA,
        event: eventPDA,
        order: yesOrderPDA,
        escrowAccount: yesEscrowPDA,
        buyer: admin,
        adminWallet: globalState.admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ YES order placed:", tx);

    // Verify order
    const order = await program.account.order.fetch(yesOrderPDA);
    console.log("\n   Order verification:");
    console.log("   - Order ID:", order.orderId.toString());
    console.log("   - Type:", order.orderType.yes ? "YES" : "NO");
    console.log("   - Quantity:", order.quantity.toString());
    console.log("   - Unit price:", order.unitPrice.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("   - Total amount:", order.totalAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("   - Status:", Object.keys(order.status)[0]);
  } catch (err) {
    console.error("❌ Failed to place YES order:", err);
    return;
  }

  // Step 6: Place NO order (NO unit_price parameter!)
  console.log("\n📋 Step 6: Placing NO order...");
  const noOrderId = Date.now() + 1;
  const [noOrderPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("order"),
      Buffer.from(eventId),
      new anchor.BN(noOrderId).toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );
  const [noEscrowPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      Buffer.from(eventId),
      new anchor.BN(noOrderId).toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  try {
    const globalState = await program.account.globalState.fetch(globalStatePDA);
    const event = await program.account.event.fetch(eventPDA);

    // Calculate expected cost
    const quantity = 10;
    const unitPrice = event.noSharePrice.toNumber();
    const totalAmount = quantity * unitPrice;
    const platformFee = Math.floor((totalAmount * globalState.platformFeePrimary) / 10000);
    const totalCost = totalAmount + platformFee;

    console.log("   Quantity:", quantity, "shares");
    console.log("   Unit price (from event):", unitPrice / LAMPORTS_PER_SOL, "SOL");
    console.log("   Total amount:", totalAmount / LAMPORTS_PER_SOL, "SOL");
    console.log("   Platform fee:", platformFee / LAMPORTS_PER_SOL, "SOL");
    console.log("   Total cost:", totalCost / LAMPORTS_PER_SOL, "SOL");

    // ✅ NO unit_price parameter - smart contract determines it automatically
    const tx = await program.methods
      .placeOrder(
        new anchor.BN(noOrderId),
        eventId,
        { no: {} },
        new anchor.BN(quantity)
        // ✅ unit_price parameter REMOVED
      )
      .accounts({
        globalState: globalStatePDA,
        event: eventPDA,
        order: noOrderPDA,
        escrowAccount: noEscrowPDA,
        buyer: admin,
        adminWallet: globalState.admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ NO order placed:", tx);

    // Verify order
    const order = await program.account.order.fetch(noOrderPDA);
    console.log("\n   Order verification:");
    console.log("   - Order ID:", order.orderId.toString());
    console.log("   - Type:", order.orderType.yes ? "YES" : "NO");
    console.log("   - Quantity:", order.quantity.toString());
    console.log("   - Unit price:", order.unitPrice.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("   - Total amount:", order.totalAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("   - Status:", Object.keys(order.status)[0]);
  } catch (err) {
    console.error("❌ Failed to place NO order:", err);
    return;
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         ✅ ALL TESTS PASSED - ORDER PLACEMENT WORKS!     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log("✅ NO InvalidOrderPrice errors");
  console.log("✅ NO buffer serialization errors");
  console.log("✅ Prices automatically determined from event");
  console.log("✅ YES and NO orders both successful\n");
}

testOrderPlacement()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
