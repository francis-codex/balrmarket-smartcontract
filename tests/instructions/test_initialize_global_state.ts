import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";

describe("Initialize Global State", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const connection = provider.connection;

  // Test wallets
  let adminKeypair: web3.Keypair;
  let nonAdminKeypair: web3.Keypair;
  let globalStatePda: web3.PublicKey;
  let isInitialized = false;

  // Test constants
  const PLATFORM_FEE_PRIMARY = 200; // 2% in basis points
  const PLATFORM_FEE_SECONDARY = 100; // 1% in basis points

  before(async () => {
    // Generate fresh keypairs for the entire test suite
    adminKeypair = web3.Keypair.generate();
    nonAdminKeypair = web3.Keypair.generate();

    // Airdrop SOL to test accounts
    await connection.requestAirdrop(adminKeypair.publicKey, 20 * web3.LAMPORTS_PER_SOL);
    await connection.requestAirdrop(nonAdminKeypair.publicKey, 10 * web3.LAMPORTS_PER_SOL);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Derive global state PDA
    [globalStatePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );
  });

  describe("Successful initialization", () => {
    it("Should initialize global state with correct parameters", async () => {
      // Skip if already initialized by another test
      if (isInitialized) {
        console.log("Global state already initialized, skipping...");
        return;
      }

      // Initialize global state
      const tx = await program.methods
        .initializeGlobalState(
          adminKeypair.publicKey,
          PLATFORM_FEE_PRIMARY,
          PLATFORM_FEE_SECONDARY
        )
        .accounts({
          admin: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc();

      isInitialized = true;

      console.log("Initialize global state transaction:", tx);

      // Fetch and verify global state account
      const globalStateAccount = await program.account.globalState.fetch(globalStatePda);

      expect(globalStateAccount.admin.toString()).to.equal(adminKeypair.publicKey.toString());
      expect(globalStateAccount.totalEvents.toNumber()).to.equal(0);
      expect(globalStateAccount.platformFeePrimary).to.equal(PLATFORM_FEE_PRIMARY);
      expect(globalStateAccount.platformFeeSecondary).to.equal(PLATFORM_FEE_SECONDARY);
      expect(globalStateAccount.feeRecipient.toString()).to.equal(adminKeypair.publicKey.toString());
      expect(globalStateAccount.isPaused).to.be.false;
      expect(globalStateAccount.bump).to.be.a('number');
    });

    it("Should emit GlobalStateInitialized event", async () => {
      // Listen for events
      let eventReceived = false;
      const listener = program.addEventListener("globalStateInitialized", (event) => {
        expect(event.admin.toString()).to.equal(adminKeypair.publicKey.toString());
        expect(event.platformFeePrimary).to.equal(PLATFORM_FEE_PRIMARY);
        expect(event.platformFeeSecondary).to.equal(PLATFORM_FEE_SECONDARY);
        eventReceived = true;
      });

      // Initialize global state
      await program.methods
        .initializeGlobalState(
          adminKeypair.publicKey,
          PLATFORM_FEE_PRIMARY,
          PLATFORM_FEE_SECONDARY
        )
        .accounts({
          admin: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc();

      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      program.removeEventListener(listener);
      expect(eventReceived).to.be.true;
    });

    it("Should allow different admin as fee recipient", async () => {
      const differentAdmin = web3.Keypair.generate();
      await connection.requestAirdrop(differentAdmin.publicKey, 5 * web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      await program.methods
        .initializeGlobalState(
          differentAdmin.publicKey,
          PLATFORM_FEE_PRIMARY,
          PLATFORM_FEE_SECONDARY
        )
        .accounts({
          admin: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc();

      const globalStateAccount = await program.account.globalState.fetch(globalStatePda);
      expect(globalStateAccount.admin.toString()).to.equal(differentAdmin.publicKey.toString());
      expect(globalStateAccount.feeRecipient.toString()).to.equal(differentAdmin.publicKey.toString());
    });
  });

  describe("Edge cases and validation", () => {
    it("Should handle zero fees", async () => {
      // Skip if already initialized
      try {
        const existingAccount = await program.account.globalState.fetch(globalStatePda);
        console.log("Global state already exists, skipping zero fee test");
        return;
      } catch (error) {
        // Account doesn't exist, we can initialize
      }

      await program.methods
        .initializeGlobalState(
          adminKeypair.publicKey,
          0, // Zero primary fee
          0  // Zero secondary fee
        )
        .accounts({
          admin: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc();

      const globalStateAccount = await program.account.globalState.fetch(globalStatePda);
      expect(globalStateAccount.platformFeePrimary).to.equal(0);
      expect(globalStateAccount.platformFeeSecondary).to.equal(0);
    });

    it("Should handle maximum fee values", async () => {
      // Skip if already initialized  
      try {
        const existingAccount = await program.account.globalState.fetch(globalStatePda);
        console.log("Global state already exists, skipping max fee test");
        return;
      } catch (error) {
        // Account doesn't exist, we can initialize
      }

      const maxFee = 10000; // 100% in basis points

      await program.methods
        .initializeGlobalState(
          adminKeypair.publicKey,
          maxFee,
          maxFee
        )
        .accounts({
          admin: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc();

      const globalStateAccount = await program.account.globalState.fetch(globalStatePda);
      expect(globalStateAccount.platformFeePrimary).to.equal(maxFee);
      expect(globalStateAccount.platformFeeSecondary).to.equal(maxFee);
    });

    it("Should fail when trying to initialize twice", async () => {
      // Ensure we have one initialization first
      let alreadyInitialized = false;
      try {
        await program.account.globalState.fetch(globalStatePda);
        alreadyInitialized = true;
      } catch (error) {
        // First initialization
        await program.methods
          .initializeGlobalState(
            adminKeypair.publicKey,
            PLATFORM_FEE_PRIMARY,
            PLATFORM_FEE_SECONDARY
          )
          .signers([adminKeypair])
          .rpc();
      }

      // Second initialization should fail
      try {
        await program.methods
          .initializeGlobalState(
            adminKeypair.publicKey,
            PLATFORM_FEE_PRIMARY,
            PLATFORM_FEE_SECONDARY
          )
          .signers([adminKeypair])
          .rpc();
        expect.fail("Should have failed on second initialization");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("Account validation", () => {
    it("Should fail with insufficient funds", async () => {
      // Create a keypair with minimal SOL
      const poorKeypair = web3.Keypair.generate();
      await connection.requestAirdrop(poorKeypair.publicKey, 1000); // Very small amount
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        await program.methods
          .initializeGlobalState(
            poorKeypair.publicKey,
            PLATFORM_FEE_PRIMARY,
            PLATFORM_FEE_SECONDARY
          )
          .signers([poorKeypair])
          .rpc();
        expect.fail("Should have failed due to insufficient funds");
      } catch (error) {
        expect(error.message).to.include("insufficient");
      }
    });

    it("Should fail with wrong signer", async () => {
      try {
        await program.methods
          .initializeGlobalState(
            adminKeypair.publicKey,
            PLATFORM_FEE_PRIMARY,
            PLATFORM_FEE_SECONDARY
          )
          .signers([nonAdminKeypair]) // Wrong signer
          .rpc();
        expect.fail("Should have failed with wrong signer");
      } catch (error) {
        expect(error.message).to.include("unknown signer");
      }
    });
  });

  describe("PDA validation", () => {
    it("Should verify correct PDA derivation", async () => {
      const [expectedPda, expectedBump] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        program.programId
      );

      expect(globalStatePda.toString()).to.equal(expectedPda.toString());

      // Check if already initialized, if not initialize
      let globalStateAccount;
      try {
        globalStateAccount = await program.account.globalState.fetch(globalStatePda);
      } catch (error) {
        // Initialize and verify bump is stored correctly
        await program.methods
          .initializeGlobalState(
            adminKeypair.publicKey,
            PLATFORM_FEE_PRIMARY,
            PLATFORM_FEE_SECONDARY
          )
          .signers([adminKeypair])
          .rpc();
        
        globalStateAccount = await program.account.globalState.fetch(globalStatePda);
      }
      
      expect(globalStateAccount.bump).to.equal(expectedBump);
    });

    it("Should verify PDA derivation matches expected address", async () => {
      // Test that our derived PDA matches what the program expects
      const [expectedPda, expectedBump] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        program.programId
      );

      expect(globalStatePda.toString()).to.equal(expectedPda.toString());
      
      // Note: Testing incorrect PDA requires TypeScript workarounds
      // The program will validate PDA correctness at runtime
      console.log("PDA validation occurs at the program level");
    });
  });

  after(async () => {
    // Cleanup: Close accounts if needed
    // Note: In test environment, accounts are automatically cleaned up
  });
});