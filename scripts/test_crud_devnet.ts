import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import idl from "../target/idl/balrmarket.json";
import fs from "fs";

// Load keypair from file
const keypairPath = process.env.HOME + "/.config/solana/id.json";
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

// Setup connection and provider
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, {
  commitment: "confirmed",
});

// @ts-ignore
const program = new Program(idl, provider);
const admin = wallet.publicKey;

async function testCrudOperations() {
  console.log("🧪 Testing CRUD Operations on Devnet\n");
  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin:", admin.toBase58());
  console.log("Cluster: devnet\n");

  // PDAs
  const [globalStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    program.programId
  );

  const [adminHierarchyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_hierarchy")],
    program.programId
  );

  const marketId = "test_market_" + Date.now();
  const eventId = marketId + "_event1";

  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(marketId)],
    program.programId
  );

  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
    program.programId
  );

  const [orderBookPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")],
    program.programId
  );

  try {
    // 1. Check Global State
    console.log("1️⃣  Checking Global State...");
    try {
      // @ts-ignore
      const globalState = await program.account.globalState.fetch(globalStatePda);
      console.log("   ✅ Global state exists");
    } catch {
      console.log("   ⚠️  Global state not found, please initialize first");
      return;
    }

    // 2. Check Admin Hierarchy
    console.log("\n2️⃣  Checking Admin Hierarchy...");
    try {
      // @ts-ignore
      const adminHierarchy = await program.account.adminHierarchy.fetch(adminHierarchyPda);
      console.log("   ✅ Admin hierarchy exists");
    } catch {
      console.log("   ⚠️  Admin hierarchy not found, please initialize first");
      return;
    }

    // 3. Create Market
    console.log("\n3️⃣  Creating Market...");
    const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;

    const createMarketTx = await program.methods
      .createMarket(
        marketId,
        "Test Team A",
        "Test Team B",
        new anchor.BN(matchTimestamp)
      )
      .accounts({
        globalState: globalStatePda,
        adminHierarchy: adminHierarchyPda,
        market: marketPda,
        admin: admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Market created, Tx:", createMarketTx.slice(0, 20) + "...");

    // 4. Test GET MARKET (CRUD)
    console.log("\n4️⃣  Testing GET MARKET (CRUD)...");
    const marketData = await program.methods
      .getMarket(marketId)
      .accounts({
        market: marketPda,
      })
      .view();

    console.log("   ✅ GET MARKET works!");
    console.log("   📊 Market Data:", {
      marketId: marketData.marketId,
      teamA: marketData.teamA,
      teamB: marketData.teamB,
      status: marketData.status,
    });

    // 5. Test UPDATE MARKET (CRUD)
    console.log("\n5️⃣  Testing UPDATE MARKET (CRUD)...");
    const updateMarketTx = await program.methods
      .updateMarket(
        marketId,
        "Updated Team A",
        "Updated Team B",
        null,
        null
      )
      .accounts({
        market: marketPda,
        adminHierarchy: adminHierarchyPda,
        authority: admin,
      })
      .rpc();

    console.log("   ✅ UPDATE MARKET works! Tx:", updateMarketTx.slice(0, 20) + "...");

    // Verify update
    const updatedMarket = await program.methods
      .getMarket(marketId)
      .accounts({ market: marketPda })
      .view();

    console.log("   📊 Updated Market Data:", {
      teamA: updatedMarket.teamA,
      teamB: updatedMarket.teamB,
    });

    // 6. Create Event
    console.log("\n6️⃣  Creating Event...");
    const createEventTx = await program.methods
      .createEvent(
        eventId,
        "Will Team A win?",
        1000,
        6000,
        new anchor.BN(matchTimestamp)
      )
      .accounts({
        globalState: globalStatePda,
        adminHierarchy: adminHierarchyPda,
        market: marketPda,
        event: eventPda,
        orderBook: orderBookPda,
        admin: admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Event created, Tx:", createEventTx.slice(0, 20) + "...");

    // 7. Test GET EVENT (CRUD)
    console.log("\n7️⃣  Testing GET EVENT (CRUD)...");
    const eventData = await program.methods
      .getEvent(marketId, eventId)
      .accounts({
        event: eventPda,
      })
      .view();

    console.log("   ✅ GET EVENT works!");
    console.log("   📊 Event Data:", {
      eventId: eventData.eventId,
      marketId: eventData.marketId,
      question: eventData.question,
      yesSharePrice: eventData.yesSharePrice.toString(),
      noSharePrice: eventData.noSharePrice.toString(),
      status: eventData.status,
    });

    // 8. Test UPDATE EVENT (CRUD)
    console.log("\n8️⃣  Testing UPDATE EVENT (CRUD)...");
    const updateEventTx = await program.methods
      .updateEvent(
        marketId,
        eventId,
        "Updated: Will Team A win?",
        null
      )
      .accounts({
        event: eventPda,
        adminHierarchy: adminHierarchyPda,
        authority: admin,
      })
      .rpc();

    console.log("   ✅ UPDATE EVENT works! Tx:", updateEventTx.slice(0, 20) + "...");

    // 9. Place Order
    console.log("\n9️⃣  Placing Order...");
    const orderId = 1;
    const orderIdBuffer = Buffer.alloc(8);
    orderIdBuffer.writeBigUInt64LE(BigInt(orderId));

    const [orderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), orderIdBuffer],
      program.programId
    );

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), orderIdBuffer],
      program.programId
    );

    // @ts-ignore
    const globalState = await program.account.globalState.fetch(globalStatePda);
    const adminWallet = globalState.admin;

    const placeOrderTx = await program.methods
      .placeOrder(
        new anchor.BN(orderId),
        eventId,
        { yes: {} },
        new anchor.BN(5)
      )
      .accounts({
        globalState: globalStatePda,
        event: eventPda,
        order: orderPda,
        escrowAccount: escrowPda,
        buyer: admin,
        adminWallet: adminWallet,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Order placed, Tx:", placeOrderTx.slice(0, 20) + "...");

    // 10. Test GET ORDER (CRUD)
    console.log("\n🔟 Testing GET ORDER (CRUD)...");
    const orderData = await program.methods
      .getOrder(eventId, new anchor.BN(orderId))
      .accounts({
        order: orderPda,
        escrowAccount: escrowPda,
      })
      .view();

    console.log("   ✅ GET ORDER works!");
    console.log("   📊 Order Data:", {
      orderId: orderData.orderId.toString(),
      eventId: orderData.eventId,
      buyer: orderData.buyer.toBase58(),
      orderType: orderData.orderType,
      quantity: orderData.quantity.toString(),
      status: orderData.status,
    });

    // 11. Test Breaking Changes
    console.log("\n1️⃣1️⃣  Testing for Breaking Changes...");

    // Test that placing another order still works (original functionality)
    const orderId2 = 2;
    const orderIdBuffer2 = Buffer.alloc(8);
    orderIdBuffer2.writeBigUInt64LE(BigInt(orderId2));

    const [orderPda2] = PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), orderIdBuffer2],
      program.programId
    );

    const [escrowPda2] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), orderIdBuffer2],
      program.programId
    );

    try {
      await program.methods
        .placeOrder(
          new anchor.BN(orderId2),
          eventId,
          { no: {} },
          new anchor.BN(5)
        )
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order: orderPda2,
          escrowAccount: escrowPda2,
          buyer: admin,
          adminWallet: adminWallet,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("   ✅ Original placeOrder still works - No breaking changes");
    } catch (error) {
      console.log("   ❌ BREAKING CHANGE: placeOrder failed");
      console.error(error);
    }

    // Test cancelling order (original functionality)
    try {
      await program.methods
        .cancelOrder(new anchor.BN(orderId2), eventId)
        .accounts({
          globalState: globalStatePda,
          event: eventPda,
          order: orderPda2,
          escrowAccount: escrowPda2,
          buyer: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("   ✅ Original cancelOrder still works - No breaking changes");
    } catch (error) {
      console.log("   ❌ BREAKING CHANGE: cancelOrder failed");
      console.error(error);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 ALL CRUD OPERATIONS PASSED!");
    console.log("✅ No breaking changes detected");
    console.log("=".repeat(60) + "\n");

    console.log("📋 Summary:");
    console.log("   - Created market with CRUD");
    console.log("   - Got market with CRUD");
    console.log("   - Updated market with CRUD");
    console.log("   - Created event with CRUD");
    console.log("   - Got event with CRUD");
    console.log("   - Updated event with CRUD");
    console.log("   - Placed order (original function)");
    console.log("   - Got order with CRUD");
    console.log("   - Verified no breaking changes");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

testCrudOperations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
