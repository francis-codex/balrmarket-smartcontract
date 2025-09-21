import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Balrmarket } from "../../target/types/balrmarket";

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
  
  // Airdrop SOL to test accounts
  const adminAirdropTx = await provider.connection.requestAirdrop(
    admin.publicKey,
    5 * anchor.web3.LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(adminAirdropTx);
  
  const nonAdminAirdropTx = await provider.connection.requestAirdrop(
    nonAdmin.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(nonAdminAirdropTx);
  
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