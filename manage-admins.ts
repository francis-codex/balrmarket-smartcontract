import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { Balrmarket } from "./target/types/balrmarket";

// Configuration
const NETWORK = process.env.SOLANA_NETWORK || "devnet";
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

console.log(`🌐 Using RPC: ${RPC_URL}`);

/**
 * Load keypair from file path
 */
function loadKeypairFromFile(filepath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

/**
 * Initialize provider and program
 */
function initializeProgram(walletKeypair: Keypair) {
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  // Load the program IDL
  const idl = JSON.parse(
    fs.readFileSync("./target/idl/balrmarket.json", "utf-8")
  );
  const program = new Program(idl, provider) as Program<Balrmarket>;

  return { provider, program, connection };
}

/**
 * Get admin hierarchy PDA
 */
function getAdminHierarchyPDA(program: Program<Balrmarket>): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_hierarchy")],
    program.programId
  );
  return pda;
}

/**
 * 1. Close existing admin hierarchy (clears all admins)
 */
async function closeAdminHierarchy(
  program: Program<Balrmarket>,
  authority: Keypair,
  rentReceiver: PublicKey
) {
  console.log("\n=== Closing Admin Hierarchy ===");
  const adminHierarchyPDA = getAdminHierarchyPDA(program);

  try {
    const tx = await program.methods
      .closeAdminHierarchy()
      .accountsPartial({
        adminHierarchy: adminHierarchyPDA,
        authority: authority.publicKey,
        rentReceiver: rentReceiver,
      })
      .signers([authority])
      .rpc();

    console.log("✅ Admin hierarchy closed successfully");
    console.log("Transaction:", tx);
    return true;
  } catch (error: any) {
    console.error("❌ Failed to close admin hierarchy:", error.message);
    return false;
  }
}

/**
 * 2. Initialize new admin hierarchy with initial super admin
 */
async function initializeAdminHierarchy(
  program: Program<Balrmarket>,
  payer: Keypair
) {
  console.log("\n=== Initializing Admin Hierarchy ===");
  const adminHierarchyPDA = getAdminHierarchyPDA(program);

  try {
    const tx = await program.methods
      .initializeAdminHierarchy()
      .accountsPartial({
        adminHierarchy: adminHierarchyPDA,
        initialSuperAdmin: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("✅ Admin hierarchy initialized successfully");
    console.log("Initial Super Admin:", payer.publicKey.toBase58());
    console.log("Transaction:", tx);
    return true;
  } catch (error: any) {
    console.error("❌ Failed to initialize admin hierarchy:", error.message);
    return false;
  }
}

/**
 * 3. Add multiple super admins efficiently (batched transactions)
 */
async function addSuperAdminsBatch(
  program: Program<Balrmarket>,
  authority: Keypair,
  newAdmins: PublicKey[]
) {
  console.log("\n=== Adding Super Admins (Batch) ===");
  const adminHierarchyPDA = getAdminHierarchyPDA(program);
  const successfulAdds: PublicKey[] = [];

  for (const admin of newAdmins) {
    try {
      const tx = await program.methods
        .addSuperAdmin(admin)
        .accountsPartial({
          adminHierarchy: adminHierarchyPDA,
          superAdmin: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      console.log(`✅ Added super admin: ${admin.toBase58()}`);
      console.log(`   Transaction: ${tx}`);
      successfulAdds.push(admin);
    } catch (error: any) {
      console.error(`❌ Failed to add ${admin.toBase58()}:`, error.message);
    }
  }

  console.log(`\n📊 Summary: ${successfulAdds.length}/${newAdmins.length} admins added`);
  return successfulAdds;
}

/**
 * 4. Get current admin info
 */
async function getAdminInfo(program: Program<Balrmarket>) {
  console.log("\n=== Current Admin Info ===");
  const adminHierarchyPDA = getAdminHierarchyPDA(program);

  try {
    const adminInfo = await program.methods
      .getAdminInfo()
      .accountsPartial({
        adminHierarchy: adminHierarchyPDA,
      })
      .view();

    console.log(`Super Admin Count: ${adminInfo.superAdminCount}/${adminInfo.maxSuperAdmins}`);
    console.log("\nSuper Admins:");
    adminInfo.superAdmins.forEach((admin: PublicKey, index: number) => {
      console.log(`  ${index + 1}. ${admin.toBase58()}`);
    });

    return adminInfo;
  } catch (error: any) {
    console.error("❌ Failed to fetch admin info:", error.message);
    return null;
  }
}

/**
 * Test RPC connection
 */
async function testConnection() {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const version = await connection.getVersion();
    console.log(`✅ Connected to Solana cluster (version: ${version["solana-core"]})\n`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to connect to RPC: ${error.message}`);
    console.error(`   RPC URL: ${RPC_URL}`);
    console.error(`\n💡 Try one of these solutions:`);
    console.error(`   1. Use a different RPC: RPC_URL="https://api.devnet.solana.com" pnpm ts-node manage-admins.ts ...`);
    console.error(`   2. Check your internet connection`);
    console.error(`   3. Try again in a few moments (RPC might be temporarily down)\n`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log(`
Usage:
  ts-node manage-admins.ts <command> [options]

Commands:
  close <authority-keypair> <rent-receiver>
    - Close admin hierarchy and clear all admins
    - Example: ts-node manage-admins.ts close ~/.config/solana/id.json <receiver-pubkey>

  init <payer-keypair>
    - Initialize new admin hierarchy with payer as initial super admin
    - Example: ts-node manage-admins.ts init ~/.config/solana/id.json

  add <authority-keypair> <admin1-pubkey> [admin2-pubkey] [admin3-pubkey] ...
    - Add one or more super admins
    - Example: ts-node manage-admins.ts add ~/.config/solana/id.json <pubkey1> <pubkey2>

  info
    - Display current admin hierarchy information
    - Example: ts-node manage-admins.ts info

  reset <authority-keypair> <admin1-pubkey> [admin2-pubkey] ...
    - Complete reset: close existing hierarchy, initialize new one, add admins
    - Example: ts-node manage-admins.ts reset ~/.config/solana/id.json <pubkey1> <pubkey2>
`);
    process.exit(0);
  }

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    process.exit(1);
  }

  try {
    if (command === "close") {
      const authorityPath = process.argv[3];
      const rentReceiverStr = process.argv[4];

      if (!authorityPath || !rentReceiverStr) {
        console.error("❌ Missing arguments. Usage: close <authority-keypair> <rent-receiver>");
        process.exit(1);
      }

      const authority = loadKeypairFromFile(authorityPath);
      const rentReceiver = new PublicKey(rentReceiverStr);
      const { program } = initializeProgram(authority);

      await closeAdminHierarchy(program, authority, rentReceiver);

    } else if (command === "init") {
      const payerPath = process.argv[3];

      if (!payerPath) {
        console.error("❌ Missing arguments. Usage: init <payer-keypair>");
        process.exit(1);
      }

      const payer = loadKeypairFromFile(payerPath);
      const { program } = initializeProgram(payer);

      await initializeAdminHierarchy(program, payer);
      await getAdminInfo(program);

    } else if (command === "add") {
      const authorityPath = process.argv[3];
      const adminPubkeys = process.argv.slice(4);

      if (!authorityPath || adminPubkeys.length === 0) {
        console.error("❌ Missing arguments. Usage: add <authority-keypair> <admin-pubkey> [...]");
        process.exit(1);
      }

      const authority = loadKeypairFromFile(authorityPath);
      const { program } = initializeProgram(authority);
      const adminsToAdd = adminPubkeys.map((pk) => new PublicKey(pk));

      await addSuperAdminsBatch(program, authority, adminsToAdd);
      await getAdminInfo(program);

    } else if (command === "info") {
      const defaultKeypairPath = process.env.HOME + "/.config/solana/id.json";
      const keypair = loadKeypairFromFile(defaultKeypairPath);
      const { program } = initializeProgram(keypair);

      await getAdminInfo(program);

    } else if (command === "reset") {
      const authorityPath = process.argv[3];
      const adminPubkeys = process.argv.slice(4);

      if (!authorityPath) {
        console.error("❌ Missing arguments. Usage: reset <authority-keypair> [admin-pubkeys...]");
        process.exit(1);
      }

      const authority = loadKeypairFromFile(authorityPath);
      const { program } = initializeProgram(authority);

      console.log("\n🔄 Starting complete admin reset...");

      // Step 1: Close existing hierarchy
      const closed = await closeAdminHierarchy(program, authority, authority.publicKey);
      if (!closed) {
        console.log("⚠️  Warning: Could not close existing hierarchy (may not exist)");
      }

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Initialize new hierarchy
      const initialized = await initializeAdminHierarchy(program, authority);
      if (!initialized) {
        console.error("❌ Failed to initialize new hierarchy");
        process.exit(1);
      }

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Add additional admins if provided
      if (adminPubkeys.length > 0) {
        const adminsToAdd = adminPubkeys.map((pk) => new PublicKey(pk));
        await addSuperAdminsBatch(program, authority, adminsToAdd);
      }

      // Step 4: Display final state
      await getAdminInfo(program);

      console.log("\n✅ Admin reset complete!");

    } else {
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "ts-node manage-admins.ts" for usage information');
      process.exit(1);
    }

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
