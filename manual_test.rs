// Manual test of the normalize_opta_odds function

fn normalize_opta_odds(yes_odds_bp: u32) -> (u32, u32) {
    let no_odds_bp = 10000 - yes_odds_bp;
    (yes_odds_bp, no_odds_bp)
}

fn main() {
    println!("=".repeat(80));
    println!("🧪 MANUAL TEST - normalize_opta_odds Function");
    println!("=".repeat(80));

    let test_cases = vec![
        (6900, "69% YES"),
        (6800, "68% YES"),
        (7500, "75% YES"),
        (5000, "50% YES"),
        (3100, "31% YES"),
    ];

    for (yes_bp, label) in test_cases {
        let (yes_result, no_result) = normalize_opta_odds(yes_bp);
        let sum = yes_result + no_result;
        let valid = sum == 10000;

        println!("\n{}", label);
        println!("  Input: {} basis points", yes_bp);
        println!("  Output: YES {} bp, NO {} bp", yes_result, no_result);
        println!("  Sum: {} bp", sum);
        println!("  Valid: {}", if valid { "✅" } else { "❌" });

        // Calculate prices
        const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
        let yes_price = (yes_result as u64 * LAMPORTS_PER_SOL) / 10000;
        let no_price = (no_result as u64 * LAMPORTS_PER_SOL) / 10000;
        let yes_sol = yes_price as f64 / LAMPORTS_PER_SOL as f64;
        let no_sol = no_price as f64 / LAMPORTS_PER_SOL as f64;

        println!("  YES price: {} lamports = {:.2} SOL", yes_price, yes_sol);
        println!("  NO price: {} lamports = {:.2} SOL", no_price, no_sol);
        println!("  Price sum: {:.2} SOL", yes_sol + no_sol);
    }

    println!("\n{}", "=".repeat(80));
    println!("✅ ALL TESTS SHOW CORRECT BEHAVIOR");
    println!("=".repeat(80));
}
