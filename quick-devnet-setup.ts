#!/usr/bin/env ts-node

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Balrmarket } from "./target/types/balrmarket";
import fs from "fs";
import os from "os";

// Your wallet addresses
const SUPER_ADMIN_1 = "6XLHnjEiQ1hZJXTspUDMpxU8arbvL12ioH7uyjMhtxu7";
const SUPER_ADMIN_2 = "GaM98upQiGYpbzYiv81tVw7fRwLC9ohdjv7L8jY9d1w2";
const REGULAR_ADMIN = "2sjrg7nVEevzgnwuLwrjeWQfKAtbFujWNKAY1dGkTT6U";

// Set up provider for devnet
const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");

function loadKeypair(): Keypair {
  const keypairPath = `${os.homedir()}/.config/solana/id.json`;
  try {
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  } catch (error) {
    console.error("❌ Error loading keypair:", error.message);
    throw error;
  }
}

async function setupDevnet() {
  console.log("🌐 Setting up complete admin hierarchy on devnet...");
  
  try {
    const wallet = loadKeypair();
    console.log("🔑 Using wallet:", wallet.publicKey.toString());

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);

    const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
    console.log("📋 Program ID:", program.programId.toString());

    const [adminHierarchyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin_hierarchy")],
      program.programId
    );

    console.log("📍 Admin Hierarchy PDA:", adminHierarchyPda.toString());

    // Check if admin hierarchy exists
    try {
      const adminHierarchy = await program.account.adminHierarchy.fetch(adminHierarchyPda);
      console.log("✅ Admin hierarchy already exists");
      console.log("👑 Current super admins:", adminHierarchy.superAdmins.map(pk => pk.toString()));
      console.log("👤 Current regular admins:", adminHierarchy.regularAdmins.map(pk => pk.toString()));
    } catch (error) {
      console.log("🔧 Initializing admin hierarchy...");
      
      const initTx = await program.methods
        .initializeAdminHierarchy()
        .accountsPartial({
          adminHierarchy: adminHierarchyPda,
          initialSuperAdmin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet])
        .rpc();
      
      console.log("✅ Admin hierarchy initialized!");
      console.log("🔗 Transaction:", initTx);
      await connection.confirmTransaction(initTx, "confirmed");
    }

    // Add super admins
    const superAdmin1 = new PublicKey(SUPER_ADMIN_1);
    const superAdmin2 = new PublicKey(SUPER_ADMIN_2);
    const regularAdmin = new PublicKey(REGULAR_ADMIN);

    console.log("\n➕ Adding super admins...");
    
    // Add first super admin
    try {
      const tx1 = await program.methods
        .addSuperAdmin(superAdmin1)
        .accountsPartial({
          adminHierarchy: adminHierarchyPda,
          superAdmin: wallet.publicKey,
        })
        .signers([wallet])
        .rpc();
      console.log("✅ Super admin 1 added:", SUPER_ADMIN_1);
      await connection.confirmTransaction(tx1, "confirmed");
    } catch (error) {
      if (error.message.includes("6102")) {
        console.log("⚠️  Super admin 1 already exists");
      } else {
        console.error("❌ Failed to add super admin 1:", error.message);
      }
    }

    // Add second super admin
    try {
      const tx2 = await program.methods
        .addSuperAdmin(superAdmin2)
        .accountsPartial({
          adminHierarchy: adminHierarchyPda,
          superAdmin: wallet.publicKey,
        })
        .signers([wallet])
        .rpc();
      console.log("✅ Super admin 2 added:", SUPER_ADMIN_2);
      await connection.confirmTransaction(tx2, "confirmed");
    } catch (error) {
      if (error.message.includes("6102")) {
        console.log("⚠️  Super admin 2 already exists");
      } else {
        console.error("❌ Failed to add super admin 2:", error.message);
      }
    }

    // Add regular admin
    console.log("\n➕ Adding regular admin...");
    try {
      const tx3 = await program.methods
        .addRegularAdmin(regularAdmin)
        .accountsPartial({
          adminHierarchy: adminHierarchyPda,
          superAdmin: wallet.publicKey,
        })
        .signers([wallet])
        .rpc();
      console.log("✅ Regular admin added:", REGULAR_ADMIN);
      await connection.confirmTransaction(tx3, "confirmed");
    } catch (error) {
      if (error.message.includes("6102")) {
        console.log("⚠️  Regular admin already exists");
      } else {
        console.error("❌ Failed to add regular admin:", error.message);
      }
    }

    // Show final status
    console.log("\n📊 Final admin status:");
    const adminInfo = await program.methods
      .getAdminInfo()
      .accountsPartial({
        adminHierarchy: adminHierarchyPda,
      })
      .view();

    console.log("👑 Super Admins:", adminInfo.superAdmins.map(pk => pk.toString()));
    console.log("👤 Regular Admins:", adminInfo.regularAdmins.map(pk => pk.toString()));
    console.log("📈 Super Admin Count:", adminInfo.superAdminCount);
    console.log("📈 Regular Admin Count:", adminInfo.regularAdminCount);

    console.log("\n🎉 Devnet setup complete!");

  } catch (error) {
    console.error("💥 Error:", error);
  }
}

async function main() {
  await setupDevnet();
}

main().catch(console.error);
