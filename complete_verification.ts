import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "/Users/franciscodex/BalrMarket-Frontend/src/lib/idl.json";

const PROGRAM_ID = new PublicKey("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");
const RPC_ENDPOINT = "https://api.devnet.solana.com";

async function verifyEverything() {
    console.log("=" .repeat(80));
    console.log("🔍 COMPLETE VERIFICATION - CHECKING EVERYTHING");
    console.log("=".repeat(80));

    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const provider = new anchor.AnchorProvider(connection, {} as any, { preflightCommitment: "confirmed" });
    const program = new anchor.Program(idl as anchor.Idl, provider);

    // Fetch all events
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: 505 }],
    });

    console.log(`\n✅ Found ${accounts.length} events on-chain\n`);

    if (accounts.length === 0) {
        console.log("❌ NO EVENTS FOUND - Need to create events first");
        return;
    }

    // Verify first event
    const firstAccount = accounts[0];
    const eventData = program.coder.accounts.decode("Event", firstAccount.account.data);

    console.log("📊 Sample Event Verification:");
    console.log("-".repeat(80));
    console.log(`Event ID: ${eventData.eventId}`);
    console.log(`Question: ${eventData.question}`);
    console.log(`\nOPTA Probabilities (basis points):`);
    console.log(`  YES: ${eventData.optaProbabilityYes} bp (${eventData.optaProbabilityYes / 100}%)`);
    console.log(`  NO:  ${eventData.optaProbabilityNo} bp (${eventData.optaProbabilityNo / 100}%)`);
    console.log(`  SUM: ${eventData.optaProbabilityYes + eventData.optaProbabilityNo} bp`);
    
    const sumCheck = eventData.optaProbabilityYes + eventData.optaProbabilityNo === 10000;
    console.log(`  ${sumCheck ? '✅' : '❌'} Sum = 10000 bp (100%)`);

    const LAMPORTS_PER_SOL = 1_000_000_000;
    const yesSol = eventData.yesSharePrice / LAMPORTS_PER_SOL;
    const noSol = eventData.noSharePrice / LAMPORTS_PER_SOL;

    console.log(`\nShare Prices:`);
    console.log(`  YES: ${eventData.yesSharePrice} lamports = ${yesSol.toFixed(4)} SOL`);
    console.log(`  NO:  ${eventData.noSharePrice} lamports = ${noSol.toFixed(4)} SOL`);
    console.log(`  SUM: ${(yesSol + noSol).toFixed(4)} SOL`);
    
    const priceCheck = Math.abs((yesSol + noSol) - 1.0) < 0.0001;
    console.log(`  ${priceCheck ? '✅' : '❌'} Sum = 1.00 SOL`);

    // Calculate platform fee for 1 share
    const platformFeeBp = 200; // 2%
    const yesFee = (eventData.yesSharePrice * platformFeeBp) / 10000;
    const noFee = (eventData.noSharePrice * platformFeeBp) / 10000;

    console.log(`\nOrder Cost Calculation (quantity = 1):`);
    console.log(`  YES Order:`);
    console.log(`    Share cost: ${yesSol.toFixed(4)} SOL`);
    console.log(`    Platform fee (2%): ${(yesFee / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`    TOTAL: ${(yesSol + yeeFee / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    
    console.log(`  NO Order:`);
    console.log(`    Share cost: ${noSol.toFixed(4)} SOL`);
    console.log(`    Platform fee (2%): ${(noFee / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`    TOTAL: ${(noSol + noFee / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    // Check all events
    console.log("\n" + "=".repeat(80));
    console.log("🔍 Checking ALL events:");
    console.log("=".repeat(80));

    let allValid = true;
    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const event = program.coder.accounts.decode("Event", account.account.data);
        
        const oddsSum = event.optaProbabilityYes + event.optaProbabilityNo;
        const priceSum = (event.yesSharePrice + event.noSharePrice) / LAMPORTS_PER_SOL;
        
        const oddsValid = oddsSum === 10000;
        const priceValid = Math.abs(priceSum - 1.0) < 0.0001;
        
        const status = oddsValid && priceValid ? '✅' : '❌';
        console.log(`${status} Event ${i + 1}: ${event.eventId}`);
        console.log(`   Odds: ${event.optaProbabilityYes + event.optaProbabilityNo} bp ${oddsValid ? '✅' : '❌'}`);
        console.log(`   Prices: ${priceSum.toFixed(4)} SOL ${priceValid ? '✅' : '❌'}`);
        
        if (!oddsValid || !priceValid) {
            allValid = false;
        }
    }

    console.log("\n" + "=".repeat(80));
    if (allValid) {
        console.log("✅✅✅ ALL EVENTS VALID - EVERYTHING WORKS 100% ✅✅✅");
    } else {
        console.log("❌ SOME EVENTS HAVE ERRORS - NEED TO FIX");
    }
    console.log("=".repeat(80));
}

verifyEverything().catch(console.error);
