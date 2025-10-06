#!/usr/bin/env ts-node

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Balrmarket } from "./target/types/balrmarket";
import fs from "fs";
import os from "os";

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

async function checkAdminHierarchy() {
  console.log("🔍 Checking admin hierarchy on devnet...\n");

  try {
    const wallet = loadKeypair();
    console.log("🔑 Using wallet:", wallet.publicKey.toString());

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);

    const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
    console.log("📋 Program ID:", program.programId.toString());

    // Derive the admin hierarchy PDA
    const [adminHierarchyPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin_hierarchy")],
      program.programId
    );

    console.log("📍 Admin Hierarchy PDA:", adminHierarchyPda.toString());
    console.log("🔢 PDA Bump:", bump);
    console.log();

    // Try to fetch the account directly
    console.log("📡 Fetching account from blockchain...");
    try {
      const accountInfo = await connection.getAccountInfo(adminHierarchyPda);

      if (!accountInfo) {
        console.log("❌ Account does NOT exist on chain");
        console.log("   You need to initialize it first with:");
        console.log("   npx ts-node quick-devnet-setup.ts");
        return;
      }

      console.log("✅ Account exists!");
      console.log("   Owner:", accountInfo.owner.toString());
      console.log("   Data Length:", accountInfo.data.length, "bytes");
      console.log("   Lamports:", accountInfo.lamports);
      console.log();

      // Now try to deserialize it
      console.log("📖 Deserializing account data...");
      const adminHierarchy = await program.account.adminHierarchy.fetch(adminHierarchyPda);

      console.log("✅ Successfully deserialized!");
      console.log("👑 Super Admins:", adminHierarchy.superAdmins.map(pk => pk.toString()));
      console.log("👤 Regular Admins:", adminHierarchy.regularAdmins.map(pk => pk.toString()));
      console.log("🔢 Bump:", adminHierarchy.bump);
      console.log();

      // Try the view method
      console.log("🔍 Testing getAdminInfo view method...");
      const adminInfo = await program.methods
        .getAdminInfo()
        .accountsPartial({
          adminHierarchy: adminHierarchyPda,
        })
        .view();

      console.log("✅ View method works!");
      console.log("📊 Admin Info Response:");
      console.log("   Super Admins:", adminInfo.superAdmins.map(pk => pk.toString()));
      console.log("   Regular Admins:", adminInfo.regularAdmins.map(pk => pk.toString()));
      console.log("   Super Admin Count:", adminInfo.superAdminCount);
      console.log("   Regular Admin Count:", adminInfo.regularAdminCount);
      console.log("   Max Super Admins:", adminInfo.maxSuperAdmins);

    } catch (error) {
      console.error("❌ Error:", error);

      if (error.message?.includes("Account does not exist")) {
        console.log("\n💡 The admin hierarchy PDA has not been initialized yet.");
        console.log("   Run: npx ts-node quick-devnet-setup.ts");
      } else if (error.message?.includes("Invalid account discriminator")) {
        console.log("\n💡 The account exists but has invalid data.");
        console.log("   This could mean:");
        console.log("   1. The account was initialized with a different program");
        console.log("   2. The account data is corrupted");
        console.log("   3. There's a mismatch between the deployed program and your IDL");
      }
    }

  } catch (error) {
    console.error("💥 Fatal error:", error);
  }
}

async function main() {
  await checkAdminHierarchy();
}

main().catch(console.error);