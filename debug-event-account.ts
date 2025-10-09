import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const programId = new PublicKey("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");

async function analyzeEventAccount() {
  // Get all Event accounts
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      {
        dataSize: 505 // New Event size (8 discriminator + 497 data)
      }
    ]
  });

  console.log(`\nFound ${accounts.length} Event accounts with size 505 bytes (new format)\n`);

  if (accounts.length === 0) {
    console.log("Checking for old format (501 bytes)...\n");
    const oldAccounts = await connection.getProgramAccounts(programId, {
      filters: [
        {
          dataSize: 501 // Old Event size (8 discriminator + 493 data)
        }
      ]
    });
    console.log(`Found ${oldAccounts.length} Event accounts with size 501 bytes (old format)\n`);

    if (oldAccounts.length > 0) {
      console.log("⚠️  WARNING: All events are in OLD format (u16)!");
      console.log("⚠️  These events are INCOMPATIBLE with the current program!");
      console.log("⚠️  You MUST create a NEW event to test.\n");

      oldAccounts.slice(0, 3).forEach((acc, i) => {
        console.log(`Old Event ${i + 1}: ${acc.pubkey.toBase58()}`);
        console.log(`  Size: ${acc.account.data.length} bytes`);
      });
    }
  } else {
    // Analyze the first new event
    const eventAccount = accounts[0];
    console.log(`Analyzing Event: ${eventAccount.pubkey.toBase58()}`);
    console.log(`Size: ${eventAccount.account.data.length} bytes\n`);

    const data = eventAccount.account.data;

    // Calculate offset to primary_market_closed_at
    const offset = 4 + 50 + 4 + 50 + 4 + 200 + 4*5 + 8*2 + 8*5 + 32 + 1 + 8 + 1 + 1 + 4 + 4 + 8 + 8 + 8 + 8 + 8;

    console.log(`Expected offset of primary_market_closed_at: ${offset}`);
    console.log(`Discriminator byte at offset ${offset}: ${data[offset]}`);

    if (data[offset] === 0) {
      console.log("✓ Field is None (valid)");
    } else if (data[offset] === 1) {
      const value = data.readBigInt64LE(offset + 1);
      console.log(`✓ Field is Some(${value}) (valid)`);
    } else {
      console.log(`✗ INVALID discriminator: ${data[offset]}`);
      console.log("  Expected 0 (None) or 1 (Some)");
      console.log("\n⚠️  This indicates a struct layout mismatch!");

      // Check bytes around this area
      console.log("\nBytes around offset " + offset + ":");
      for (let i = -10; i <= 10; i++) {
        const pos = offset + i;
        if (pos >= 0 && pos < data.length) {
          console.log(`  [${pos}]: ${data[pos]} ${i === 0 ? '<-- discriminator' : ''}`);
        }
      }
    }
  }
}

analyzeEventAccount().catch(console.error);
