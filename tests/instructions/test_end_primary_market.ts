import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Balrmarket } from "../../target/types/balrmarket";
import { expect } from "chai";
import { createEvent, createGlobalState, createMarket } from "../utils/test_utils";

describe("end_primary_market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Balrmarket as Program<Balrmarket>;
  const admin = provider.wallet;

  let globalStateKeypair: anchor.web3.Keypair;
  let marketId: string;
  let eventId: string;
  let eventKeypair: anchor.web3.Keypair;

  beforeEach(async () => {
    // Initialize global state
    globalStateKeypair = anchor.web3.Keypair.generate();
    await createGlobalState(program, admin, globalStateKeypair, 200, 200);

    // Create market
    marketId = `market_${Date.now()}`;
    await createMarket(
      program,
      admin,
      marketId,
      "Team A",
      "Team B",
      Math.floor(Date.now() / 1000) + 86400 // 24 hours from now
    );

    // Create event with event_start_time in the future initially
    eventId = `event_${Date.now()}`;
    const eventStartTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    await program.methods
      .createEvent(
        eventId,
        "Will Team A win?",
        1000,
        5000, // 50% odds
        eventStartTime
      )
      .accounts({
        event: eventPda,
        globalState: globalStateKeypair.publicKey,
        admin: admin.publicKey,
      })
      .rpc();

    // Store event PDA for later use
    eventKeypair = { publicKey: eventPda } as any;
  });

  it("Should successfully end primary market when event has started", async () => {
    // First, update the event to have started (simulate time passing)
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Get the event account
    const eventAccount = await program.account.event.fetch(eventKeypair.publicKey);
    
    // Manually set event_start_time to past for testing
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    // End primary market
    await program.methods
      .endPrimaryMarket(eventId)
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        admin: admin.publicKey,
      })
      .rpc();

    // Verify event status changed
    const updatedEvent = await program.account.event.fetch(eventPda);
    expect(updatedEvent.status).to.deep.equal({ primaryClosed: {} });
    expect(updatedEvent.primaryMarketClosedAt).to.not.be.null;
  });

  it("Should fail to end primary market if not admin", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();
    
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    try {
      await program.methods
        .endPrimaryMarket(eventId)
        .accounts({
          globalState: globalStateKeypair.publicKey,
          event: eventPda,
          admin: nonAdmin.publicKey,
        })
        .signers([nonAdmin])
        .rpc();
      
      expect.fail("Should have failed with unauthorized error");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("Unauthorized");
    }
  });

  it("Should fail to end primary market if already closed", async () => {
    const [eventPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      program.programId
    );

    // End primary market first time
    await program.methods
      .endPrimaryMarket(eventId)
      .accounts({
        globalState: globalStateKeypair.publicKey,
        event: eventPda,
        admin: admin.publicKey,
      })
      .rpc();

    // Try to end it again
    try {
      await program.methods
        .endPrimaryMarket(eventId)
        .accounts({
          globalState: globalStateKeypair.publicKey,
          event: eventPda,
          admin: admin.publicKey,
        })
        .rpc();
      
      expect.fail("Should have failed with primary already closed error");
    } catch (error) {
      expect(error.error.errorCode.code).to.equal("PrimaryAlreadyClosed");
    }
  });
});