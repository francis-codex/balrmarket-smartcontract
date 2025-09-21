import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../target/types/balrmarket";
import { PublicKey, Keypair } from "@solana/web3.js";

// Admin hierarchy PDA seeds
const ADMIN_HIERARCHY_SEED = "admin_hierarchy";

async function addSuperAdmins() {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

  // The two wallets to add as super admins
  const superAdmin1 = new PublicKey("6XLHnjEiQ1hZJXTspUDMpxU8arbvL12ioH7uyjMhtxu7");
  const superAdmin2 = new PublicKey("GaM98upQiGYpbzYiv81tVw7fRwLC9ohdjv7L8jY9d1w2");

  // Get the admin hierarchy PDA
  const [adminHierarchyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(ADMIN_HIERARCHY_SEED)],
    program.programId
  );

  console.log("Admin Hierarchy PDA:", adminHierarchyPda.toString());
  console.log("Current super admin:", provider.wallet.publicKey.toString());

  try {
    // First, check current admin info
    console.log("\n=== Current Admin Info ===");
    try {
      const adminInfo = await program.methods
        .getAdminInfo()
        .accounts({
          adminHierarchy: adminHierarchyPda,
        } as any)
        .view();

      console.log("Current super admins:", adminInfo.superAdmins.map(pubkey => pubkey.toString()));
      console.log("Current regular admins:", adminInfo.regularAdmins.map(pubkey => pubkey.toString()));
      console.log("Super admin count:", adminInfo.superAdminCount);
      console.log("Regular admin count:", adminInfo.regularAdminCount);
      console.log("Max super admins:", adminInfo.maxSuperAdmins);
    } catch (error) {
      console.log("Admin hierarchy not yet initialized. Initializing now...");

      // Initialize the admin hierarchy first
      const initTx = await program.methods
        .initializeAdminHierarchy()
        .accounts({
          adminHierarchy: adminHierarchyPda,
          initialSuperAdmin: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .rpc();

      console.log("Admin hierarchy initialized. Transaction:", initTx);
      await provider.connection.confirmTransaction(initTx);
    }

    // Add the first super admin
    console.log("\n=== Adding First Super Admin ===");
    console.log("Adding:", superAdmin1.toString());

    const tx1 = await program.methods
      .addSuperAdmin(superAdmin1)
      .accounts({
        adminHierarchy: adminHierarchyPda,
        superAdmin: provider.wallet.publicKey,
      } as any)
      .rpc();

    console.log("First super admin added. Transaction:", tx1);
    await provider.connection.confirmTransaction(tx1);

    // Add the second super admin
    console.log("\n=== Adding Second Super Admin ===");
    console.log("Adding:", superAdmin2.toString());

    const tx2 = await program.methods
      .addSuperAdmin(superAdmin2)
      .accounts({
        adminHierarchy: adminHierarchyPda,
        superAdmin: provider.wallet.publicKey,
      } as any)
      .rpc();

    console.log("Second super admin added. Transaction:", tx2);
    await provider.connection.confirmTransaction(tx2);

    // Verify the final state
    console.log("\n=== Final Admin Info ===");
    const finalAdminInfo = await program.methods
      .getAdminInfo()
      .accounts({
        adminHierarchy: adminHierarchyPda,
      } as any)
      .view();

    console.log("Final super admins:", finalAdminInfo.superAdmins.map(pubkey => pubkey.toString()));
    console.log("Final regular admins:", finalAdminInfo.regularAdmins.map(pubkey => pubkey.toString()));
    console.log("Final super admin count:", finalAdminInfo.superAdminCount);
    console.log("Final regular admin count:", finalAdminInfo.regularAdminCount);

    console.log("\n✅ Successfully added both super admins!");

  } catch (error) {
    console.error("Error adding super admins:", error);

    // If we get a specific admin error, provide more context
    if (error.message?.includes("AdminAlreadyExists")) {
      console.log("One or both of the wallets are already admins in the system.");
    } else if (error.message?.includes("MaxSuperAdminsExceeded")) {
      console.log("Maximum number of super admins (3) has been reached.");
    } else if (error.message?.includes("SuperAdminRequired")) {
      console.log("Current wallet is not authorized to add super admins.");
    }
  }
}

// Run the script
addSuperAdmins()
  .then(() => {
    console.log("Script completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });