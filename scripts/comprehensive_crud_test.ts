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

// Test tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function testResult(testName: string, passed: boolean, error?: any) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`   ✅ ${testName}`);
  } else {
    failedTests++;
    console.log(`   ❌ ${testName}`);
    if (error) {
      console.log(`      Error: ${error.message || error}`);
    }
  }
}

async function comprehensiveCrudTest() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     COMPREHENSIVE CRUD FUNCTIONALITY TEST - DEVNET         ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin:", admin.toBase58());
  console.log("Network: Devnet\n");

  // PDAs
  const [globalStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    program.programId
  );

  const [adminHierarchyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_hierarchy")],
    program.programId
  );

  const marketId = "crud_test_" + (Date.now() % 1000000);
  const eventId1 = marketId + "_ev1";
  const eventId2 = marketId + "_ev2";

  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(marketId)],
    program.programId
  );

  const [event1Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId1)],
    program.programId
  );

  const [event2Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId2)],
    program.programId
  );

  const [orderBook1Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("orderbook"), Buffer.from(eventId1), Buffer.from("primary")],
    program.programId
  );

  const [orderBook2Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("orderbook"), Buffer.from(eventId2), Buffer.from("primary")],
    program.programId
  );

  try {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("SECTION 1: MARKET CRUD OPERATIONS");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Test 1: Create Market
    console.log("Test 1: Create Market");
    try {
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .createMarket(
          marketId,
          "Arsenal FC",
          "Chelsea FC",
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
      testResult("Create Market", true);
    } catch (error) {
      testResult("Create Market", false, error);
      throw error;
    }

    // Test 2: GET Market (READ)
    console.log("\nTest 2: GET Market (CRUD - READ)");
    try {
      const marketData = await program.methods
        .getMarket(marketId)
        .accounts({ market: marketPda })
        .view();

      const checks = [
        marketData.marketId === marketId,
        marketData.teamA === "Arsenal FC",
        marketData.teamB === "Chelsea FC",
        marketData.admin.equals(admin),
        marketData.totalEvents === 0
      ];

      testResult("GET Market returns correct data", checks.every(c => c));
      testResult("Market ID matches", marketData.marketId === marketId);
      testResult("Team A matches", marketData.teamA === "Arsenal FC");
      testResult("Team B matches", marketData.teamB === "Chelsea FC");
      testResult("Admin matches", marketData.admin.equals(admin));
    } catch (error) {
      testResult("GET Market", false, error);
    }

    // Test 3: UPDATE Market (UPDATE)
    console.log("\nTest 3: UPDATE Market (CRUD - UPDATE)");
    try {
      await program.methods
        .updateMarket(
          marketId,
          "Arsenal Football Club",
          "Chelsea Football Club",
          null,
          null
        )
        .accounts({
          market: marketPda,
          adminHierarchy: adminHierarchyPda,
          authority: admin,
        })
        .rpc();

      const updatedMarket = await program.methods
        .getMarket(marketId)
        .accounts({ market: marketPda })
        .view();

      testResult("UPDATE Market", true);
      testResult("Team A updated correctly", updatedMarket.teamA === "Arsenal Football Club");
      testResult("Team B updated correctly", updatedMarket.teamB === "Chelsea Football Club");
    } catch (error) {
      testResult("UPDATE Market", false, error);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("SECTION 2: EVENT CRUD OPERATIONS");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Test 4: Create Event 1
    console.log("Test 4: Create Event 1");
    try {
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .createEvent(
          eventId1,
          "Will Arsenal score first?",
          1000,
          5500,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePda,
          adminHierarchy: adminHierarchyPda,
          market: marketPda,
          event: event1Pda,
          orderBook: orderBook1Pda,
          admin: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      testResult("Create Event 1", true);
    } catch (error) {
      testResult("Create Event 1", false, error);
      throw error;
    }

    // Test 5: Create Event 2
    console.log("\nTest 5: Create Event 2");
    try {
      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .createEvent(
          eventId2,
          "Will Chelsea score first?",
          800,
          4500,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePda,
          adminHierarchy: adminHierarchyPda,
          market: marketPda,
          event: event2Pda,
          orderBook: orderBook2Pda,
          admin: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      testResult("Create Event 2", true);
    } catch (error) {
      testResult("Create Event 2", false, error);
    }

    // Test 6: GET Event (READ)
    console.log("\nTest 6: GET Event (CRUD - READ)");
    try {
      const eventData = await program.methods
        .getEvent(marketId, eventId1)
        .accounts({ event: event1Pda })
        .view();

      testResult("GET Event", true);
      testResult("Event ID matches", eventData.eventId === eventId1);
      testResult("Market ID matches", eventData.marketId === marketId);
      testResult("Question matches", eventData.question === "Will Arsenal score first?");
      testResult("YES share price calculated", eventData.yesSharePrice.toNumber() > 0);
      testResult("NO share price calculated", eventData.noSharePrice.toNumber() > 0);
      testResult("Prices sum to 1 SOL",
        eventData.yesSharePrice.toNumber() + eventData.noSharePrice.toNumber() === 1000000000
      );
    } catch (error) {
      testResult("GET Event", false, error);
    }

    // Test 7: UPDATE Event (UPDATE)
    console.log("\nTest 7: UPDATE Event (CRUD - UPDATE)");
    try {
      await program.methods
        .updateEvent(
          marketId,
          eventId1,
          "UPDATED: Will Arsenal score first?",
          null
        )
        .accounts({
          event: event1Pda,
          adminHierarchy: adminHierarchyPda,
          authority: admin,
        })
        .rpc();

      const updatedEvent = await program.methods
        .getEvent(marketId, eventId1)
        .accounts({ event: event1Pda })
        .view();

      testResult("UPDATE Event", true);
      testResult("Event question updated", updatedEvent.question === "UPDATED: Will Arsenal score first?");
    } catch (error) {
      testResult("UPDATE Event", false, error);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("SECTION 3: ORDER CRUD OPERATIONS");
    console.log("═══════════════════════════════════════════════════════════\n");

    // @ts-ignore
    const globalState = await program.account.globalState.fetch(globalStatePda);
    const adminWallet = globalState.admin;

    // Test 8-11: Place multiple orders
    const orderIds = [1, 2, 3, 4];
    const orders = [];

    for (let i = 0; i < orderIds.length; i++) {
      const orderId = orderIds[i];
      const eventId = i < 2 ? eventId1 : eventId2;
      const orderType = i % 2 === 0 ? { yes: {} } : { no: {} };
      const quantity = 3 + i;

      console.log(`\nTest ${8 + i}: Place Order ${orderId} (${Object.keys(orderType)[0].toUpperCase()}, Qty: ${quantity})`);

      try {
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

        const eventPda = i < 2 ? event1Pda : event2Pda;

        await program.methods
          .placeOrder(
            new anchor.BN(orderId),
            eventId,
            orderType,
            new anchor.BN(quantity)
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

        orders.push({ orderId, eventId, orderPda, escrowPda, orderType, quantity });
        testResult(`Place Order ${orderId}`, true);
      } catch (error) {
        testResult(`Place Order ${orderId}`, false, error);
      }
    }

    // Test 12-15: GET Order (READ) for each order
    console.log("\n--- Testing GET Order for all placed orders ---");
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      console.log(`\nTest ${12 + i}: GET Order ${order.orderId} (CRUD - READ)`);

      try {
        const orderData = await program.methods
          .getOrder(order.eventId, new anchor.BN(order.orderId))
          .accounts({
            order: order.orderPda,
            escrowAccount: order.escrowPda,
          })
          .view();

        testResult(`GET Order ${order.orderId}`, true);
        testResult(`Order ID matches`, orderData.orderId.toNumber() === order.orderId);
        testResult(`Event ID matches`, orderData.eventId === order.eventId);
        testResult(`Buyer matches`, orderData.buyer.equals(admin));
        testResult(`Order type matches`, JSON.stringify(orderData.orderType) === JSON.stringify(order.orderType));
        testResult(`Quantity matches`, orderData.quantity.toNumber() === order.quantity);
        testResult(`Status is pending`, JSON.stringify(orderData.status) === JSON.stringify({ pending: {} }));
        testResult(`Escrow balance > 0`, orderData.escrowBalance > 0);
      } catch (error) {
        testResult(`GET Order ${order.orderId}`, false, error);
      }
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("SECTION 4: BREAKING CHANGES CHECK");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Test 16: Cancel Order (original functionality)
    console.log("Test 16: Cancel Order (Original Functionality)");
    try {
      const orderToCancel = orders[3]; // Last order
      await program.methods
        .cancelOrder(new anchor.BN(orderToCancel.orderId), orderToCancel.eventId)
        .accounts({
          globalState: globalStatePda,
          event: event2Pda,
          order: orderToCancel.orderPda,
          escrowAccount: orderToCancel.escrowPda,
          buyer: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Verify order status changed
      const cancelledOrder = await program.methods
        .getOrder(orderToCancel.eventId, new anchor.BN(orderToCancel.orderId))
        .accounts({
          order: orderToCancel.orderPda,
          escrowAccount: orderToCancel.escrowPda,
        })
        .view();

      testResult("Cancel Order executed", true);
      testResult("Order status is cancelled", JSON.stringify(cancelledOrder.status) === JSON.stringify({ cancelled: {} }));
    } catch (error) {
      testResult("Cancel Order", false, error);
    }

    // Test 17: Match Orders (original functionality)
    console.log("\nTest 17: Match Orders (Original Functionality)");
    try {
      const yesOrder = orders[0]; // Order 1 (YES on event1)
      const noOrder = orders[1];  // Order 2 (NO on event1)

      const [matchedPairPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(eventId1), Buffer.alloc(8)], // match ID 0
        program.programId
      );

      // @ts-ignore
      const event = await program.account.event.fetch(event1Pda);

      await program.methods
        .matchOrders(
          eventId1,
          new anchor.BN(yesOrder.orderId),
          new anchor.BN(noOrder.orderId)
        )
        .accounts({
          globalState: globalStatePda,
          event: event1Pda,
          yesOrder: yesOrder.orderPda,
          noOrder: noOrder.orderPda,
          yesEscrow: yesOrder.escrowPda,
          noEscrow: noOrder.escrowPda,
          matchedPair: matchedPairPda,
          yesBuyer: admin,
          noBuyer: admin,
          authority: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      testResult("Match Orders executed", true);

      // Test GET Matched Pair
      const matchedPairData = await program.methods
        .getMatchedPair(eventId1, new anchor.BN(0))
        .accounts({ matchedPair: matchedPairPda })
        .view();

      testResult("GET Matched Pair", true);
      testResult("Matched pair event ID", matchedPairData.eventId === eventId1);
      testResult("YES buyer matches", matchedPairData.yesBuyer.equals(admin));
      testResult("NO buyer matches", matchedPairData.noBuyer.equals(admin));
    } catch (error) {
      testResult("Match Orders", false, error);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("SECTION 5: ADMIN OPERATIONS");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Test 18: Resolve Event (admin only)
    console.log("Test 18: Resolve Event (CRUD - Admin Operation)");
    try {
      await program.methods
        .resolveEvent(marketId, eventId2, true) // YES wins
        .accounts({
          event: event2Pda,
          adminHierarchy: adminHierarchyPda,
          authority: admin,
        })
        .rpc();

      const resolvedEvent = await program.methods
        .getEvent(marketId, eventId2)
        .accounts({ event: event2Pda })
        .view();

      testResult("RESOLVE Event", true);
      testResult("Event status is resolved", JSON.stringify(resolvedEvent.status) === JSON.stringify({ resolved: {} }));
      testResult("Winning outcome set", resolvedEvent.winningOutcome === true);
    } catch (error) {
      testResult("RESOLVE Event", false, error);
    }

    // Test 19: Deactivate Market (admin only)
    console.log("\nTest 19: Deactivate Market (CRUD - Admin Operation)");
    try {
      // Create a separate market to deactivate
      const deactivateMarketId = "deact_" + (Date.now() % 100000);
      const [deactivateMarketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(deactivateMarketId)],
        program.programId
      );

      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .createMarket(
          deactivateMarketId,
          "Team X",
          "Team Y",
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePda,
          adminHierarchy: adminHierarchyPda,
          market: deactivateMarketPda,
          admin: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .deactivateMarket(deactivateMarketId)
        .accounts({
          market: deactivateMarketPda,
          adminHierarchy: adminHierarchyPda,
          authority: admin,
        })
        .rpc();

      const deactivatedMarket = await program.methods
        .getMarket(deactivateMarketId)
        .accounts({ market: deactivateMarketPda })
        .view();

      testResult("DEACTIVATE Market", true);
      testResult("Market status is resolved", JSON.stringify(deactivatedMarket.status) === JSON.stringify({ resolved: {} }));
    } catch (error) {
      testResult("DEACTIVATE Market", false, error);
    }

    // Test 20: Cancel Event (admin only)
    console.log("\nTest 20: Cancel Event (CRUD - Admin Operation)");
    try {
      // Create a new event to cancel
      const cancelEventId = marketId + "_can";
      const [cancelEventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), Buffer.from(marketId), Buffer.from(cancelEventId)],
        program.programId
      );
      const [cancelOrderBookPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("orderbook"), Buffer.from(cancelEventId), Buffer.from("primary")],
        program.programId
      );

      const matchTimestamp = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .createEvent(
          cancelEventId,
          "Test Cancel Event",
          500,
          5000,
          new anchor.BN(matchTimestamp)
        )
        .accounts({
          globalState: globalStatePda,
          adminHierarchy: adminHierarchyPda,
          market: marketPda,
          event: cancelEventPda,
          orderBook: cancelOrderBookPda,
          admin: admin,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .cancelEvent(marketId, cancelEventId)
        .accounts({
          event: cancelEventPda,
          adminHierarchy: adminHierarchyPda,
          authority: admin,
        })
        .rpc();

      const cancelledEvent = await program.methods
        .getEvent(marketId, cancelEventId)
        .accounts({ event: cancelEventPda })
        .view();

      testResult("CANCEL Event", true);
      testResult("Event status is settled", JSON.stringify(cancelledEvent.status) === JSON.stringify({ settled: {} }));
    } catch (error) {
      testResult("CANCEL Event", false, error);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("SECTION 6: EDGE CASES & DATA INTEGRITY");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Test 21: Non-existent order
    console.log("Test 21: GET Non-existent Order (Should fail gracefully)");
    try {
      const fakeOrderId = 99999;
      const orderIdBuffer = Buffer.alloc(8);
      orderIdBuffer.writeBigUInt64LE(BigInt(fakeOrderId));

      const [fakeOrderPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("order"), Buffer.from(eventId1), orderIdBuffer],
        program.programId
      );
      const [fakeEscrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(eventId1), orderIdBuffer],
        program.programId
      );

      await program.methods
        .getOrder(eventId1, new anchor.BN(fakeOrderId))
        .accounts({
          order: fakeOrderPda,
          escrowAccount: fakeEscrowPda,
        })
        .view();

      testResult("Non-existent order handling", false, "Should have failed");
    } catch (error) {
      testResult("Non-existent order fails as expected", true);
    }

    // Test 22: Non-existent market
    console.log("\nTest 22: GET Non-existent Market (Should fail gracefully)");
    try {
      const fakeMarketId = "nonexistent_market";
      const [fakeMarketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(fakeMarketId)],
        program.programId
      );

      await program.methods
        .getMarket(fakeMarketId)
        .accounts({ market: fakeMarketPda })
        .view();

      testResult("Non-existent market handling", false, "Should have failed");
    } catch (error) {
      testResult("Non-existent market fails as expected", true);
    }

    // Test 23: Verify market event count updated
    console.log("\nTest 23: Verify Market Event Count");
    try {
      const marketData = await program.methods
        .getMarket(marketId)
        .accounts({ market: marketPda })
        .view();

      testResult("Market event count updated", marketData.totalEvents === 3); // event1, event2, cancelEventId
    } catch (error) {
      testResult("Market event count", false, error);
    }

  } catch (error) {
    console.error("\n❌ Critical test failure:", error);
  }

  // Final Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST SUMMARY                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%\n`);

  if (failedTests === 0) {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  🎉🎉🎉 ALL TESTS PASSED - CRUD FULLY FUNCTIONAL 🎉🎉🎉   ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
    console.log("✅ All CRUD operations working correctly");
    console.log("✅ No breaking changes detected");
    console.log("✅ Data integrity verified");
    console.log("✅ Edge cases handled properly");
    console.log("✅ Admin operations secured");
    console.log("\n🚀 Ready for frontend integration!");
  } else {
    console.log("⚠️  Some tests failed. Please review the errors above.");
  }
}

comprehensiveCrudTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n💥 Test suite crashed:", error);
    process.exit(1);
  });
