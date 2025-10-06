/**
 * Add Regular Admin Script
 *
 * Only super admins can add regular admins.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Balrmarket } from "./target/types/balrmarket";

async function addRegularAdmin() {
  console.log("\n👤 Adding Regular Admin\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;

  const superAdmin = provider.wallet.publicKey;
  console.log("Super Admin (you):", superAdmin.toBase58());

  // Replace with the wallet address you want to make a regular admin
  const NEW_REGULAR_ADMIN = "APYMCzABhHz8yBy8vWo5vgoVus9kTa4iYSQZJHNzjJhF";
  const newRegularAdmin = new PublicKey(NEW_REGULAR_ADMIN);

  const [adminHierarchyPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_hierarchy")],
    program.programId
  );

  try {
    const tx = await program.methods
      .addRegularAdmin(newRegularAdmin)
      .accountsPartial({
        adminHierarchy: adminHierarchyPDA,
        superAdmin: superAdmin,
      })
      .rpc();

    console.log("✅ Regular admin added successfully!");
    console.log("   New admin:", newRegularAdmin.toBase58());
    console.log("   Transaction:", tx);

    // Verify
    const adminInfo = await program.methods
      .getAdminInfo()
      .accountsPartial({
        adminHierarchy: adminHierarchyPDA,
      })
      .view();

    console.log("\n📊 Updated Admin Counts:");
    console.log("   Super admins:", adminInfo.superAdminCount);
    console.log("   Regular admins:", adminInfo.regularAdminCount);
  } catch (error) {
    console.error("❌ Failed to add regular admin:", error);
    throw error;
  }
}

addRegularAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
