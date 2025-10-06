/**
 * Quick Deployment Verification Script
 *
 * This script verifies that the deployed program is working correctly
 * by checking account initialization and basic functionality.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Balrmarket } from "./target/types/balrmarket";

async function verifyDeployment() {
  console.log("\n🔍 Verifying Deployment on Devnet\n");

  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

  const admin = provider.wallet.publicKey;
  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin wallet:", admin.toBase58());
  console.log("Balance:", await provider.connection.getBalance(admin) / LAMPORTS_PER_SOL, "SOL\n");

  // Derive PDAs
  const [globalStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    program.programId
  );

  const [adminHierarchyPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_hierarchy")],
    program.programId
  );

  // Check Global State
  console.log("📋 Checking Global State...");
  try {
    const globalState = await program.account.globalState.fetch(globalStatePDA);
    console.log("✅ Global State exists");
    console.log("   Admin:", globalState.admin.toBase58());
    console.log("   Primary fee:", globalState.platformFeePrimary, "bps");
    console.log("   Secondary fee:", globalState.platformFeeSecondary, "bps");
  } catch (error) {
    console.log("⚠️  Global State not initialized");
    console.log("   Run: anchor run initialize");
  }

  // Check Admin Hierarchy
  console.log("\n📋 Checking Admin Hierarchy...");
  try {
    const adminInfo = await program.methods
      .getAdminInfo()
      .accounts({
        adminHierarchy: adminHierarchyPDA,
      })
      .view();
    console.log("✅ Admin Hierarchy exists");
    console.log("   Super admins:", adminInfo.superAdminCount);
    console.log("   Regular admins:", adminInfo.regularAdminCount);
  } catch (error) {
    console.log("⚠️  Admin Hierarchy not initialized");
    console.log("   Run: anchor run initialize");
  }

  console.log("\n✅ Deployment verification complete!");
  console.log("\nNext steps:");
  console.log("1. Initialize platform (if needed): anchor run initialize");
  console.log("2. Test order placement: ts-node test-order-placement.ts");
  console.log("3. Test frontend integration with deployed contract\n");
}

verifyDeployment()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  });
