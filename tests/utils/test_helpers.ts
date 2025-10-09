import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Balrmarket } from "../../target/types/balrmarket";

/**
 * Rate-limited airdrop helper to avoid 429 errors
 */
export async function airdropWithRetry(
  connection: anchor.web3.Connection,
  publicKey: PublicKey,
  amount: number,
  maxRetries: number = 5
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const airdropTx = await connection.requestAirdrop(publicKey, amount);
      await connection.confirmTransaction(airdropTx);
      return;
    } catch (error: any) {
      if (error.message?.includes("429") && i < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, i), 10000); // Exponential backoff, max 10s
        console.log(`      ⏳ Rate limited, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

export interface TestAccounts {
  admin: Keypair;
  nonAdmin: Keypair;
  globalStatePda: PublicKey;
  globalStateBump: number;
  adminHierarchyPda: PublicKey;
  adminHierarchyBump: number;
}

/**
 * Sets up test accounts and initializes the admin hierarchy system
 * This should be called in the before() hook of each test suite
 */
export async function setupTestAccounts(
  program: Program<Balrmarket>,
  provider: anchor.AnchorProvider
): Promise<TestAccounts> {
  // Generate test keypairs
  const admin = Keypair.generate();
  const nonAdmin = Keypair.generate();
  
  // Airdrop SOL to test accounts with rate limit handling
  await airdropWithRetry(
    provider.connection,
    admin.publicKey,
    5 * anchor.web3.LAMPORTS_PER_SOL
  );

  // Add delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 500));

  await airdropWithRetry(
    provider.connection,
    nonAdmin.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL
  );
  
  // Derive PDAs
  const [globalStatePda, globalStateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    program.programId
  );
  
  const [adminHierarchyPda, adminHierarchyBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_hierarchy")],
    program.programId
  );
  
  // Initialize admin hierarchy first (required for new system)
  try {
    await program.account.adminHierarchy.fetch(adminHierarchyPda);
    console.log("      ✓ Admin hierarchy already exists");
  } catch (error) {
    // Admin hierarchy doesn't exist, create it
    await program.methods
      .initializeAdminHierarchy()
      .accountsPartial({
        adminHierarchy: adminHierarchyPda,
        initialSuperAdmin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    console.log("      ✓ Created admin hierarchy with test admin as super admin");
  }

  // Initialize global state if it doesn't exist
  try {
    await program.account.globalState.fetch(globalStatePda);
    console.log("      ✓ Global state already exists");
  } catch (error) {
    // Global state doesn't exist, create it with our admin
    await program.methods
      .initializeGlobalState(
        admin.publicKey,
        250, // 2.5% platform fee primary
        300  // 3% platform fee secondary
      )
      .accountsPartial({
        globalState: globalStatePda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    console.log("      ✓ Created new global state with test admin");
  }
  
  return {
    admin,
    nonAdmin,
    globalStatePda,
    globalStateBump,
    adminHierarchyPda,
    adminHierarchyBump,
  };
}

/**
 * Helper function to get create market accounts
 */
export function getCreateMarketAccounts(
  testAccounts: TestAccounts,
  marketId: string,
  program: Program<Balrmarket>
) {
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(marketId)],
    program.programId
  );
  
  return {
    globalState: testAccounts.globalStatePda,
    adminHierarchy: testAccounts.adminHierarchyPda,
    market: marketPda,
    admin: testAccounts.admin.publicKey,
    systemProgram: SystemProgram.programId,
  };
}

/**
 * Helper function to get create event accounts
 */
export function getCreateEventAccounts(
  testAccounts: TestAccounts,
  marketId: string,
  eventId: string,
  program: Program<Balrmarket>
) {
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
  
  return {
    globalState: testAccounts.globalStatePda,
    adminHierarchy: testAccounts.adminHierarchyPda,
    market: marketPda,
    event: eventPda,
    orderBook: orderBookPda,
    admin: testAccounts.admin.publicKey,
    systemProgram: SystemProgram.programId,
  };
}

/**
 * Helper function to get end primary market accounts
 */
export function getEndPrimaryMarketAccounts(
  testAccounts: TestAccounts,
  eventPda: PublicKey,
  program: Program<Balrmarket>
) {
  return {
    globalState: testAccounts.globalStatePda,
    adminHierarchy: testAccounts.adminHierarchyPda,
    event: eventPda,
    admin: testAccounts.admin.publicKey,
  };
}

/**
 * Helper function to get collect fees accounts
 */
export function getCollectFeesAccounts(
  testAccounts: TestAccounts,
  eventPda: PublicKey,
  program: Program<Balrmarket>
) {
  return {
    globalState: testAccounts.globalStatePda,
    adminHierarchy: testAccounts.adminHierarchyPda,
    event: eventPda,
    admin: testAccounts.admin.publicKey,
    adminWallet: testAccounts.admin.publicKey,
    systemProgram: SystemProgram.programId,
  };
}