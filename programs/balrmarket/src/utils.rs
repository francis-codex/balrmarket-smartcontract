use anchor_lang::{prelude::*, solana_program::native_token::LAMPORTS_PER_SOL};
use crate::error::ErrorCode;

/// Normalize OPTA odds by removing bookmaker margin
/// Returns (yes_probability_bp, no_probability_bp) where bp = basis points
pub fn normalize_opta_odds(yes_odds_bp: u16) -> (u16, u16) {
    // Convert basis points to probabilities
    let yes_prob = yes_odds_bp as f64 / 10000.0;
    let no_prob = (10000 - yes_odds_bp) as f64 / 10000.0;
    let total_prob = yes_prob + no_prob;
    
    // Normalize to remove bookmaker margin
    let normalized_yes = (yes_prob / total_prob * 10000.0) as u16;
    let normalized_no = 10000 - normalized_yes;
    
    (normalized_yes, normalized_no)
}

/// Calculate share prices from probabilities
pub fn calculate_share_prices(yes_probability_bp: u16) -> (u64, u64) {
    let yes_price = (yes_probability_bp as u64 * LAMPORTS_PER_SOL) / 10000;
    let no_price = LAMPORTS_PER_SOL - yes_price;
    (yes_price, no_price)
}

/// Validate timing constraints for events
pub fn validate_event_timing(
    current_time: i64,
    match_timestamp: i64,
) -> Result<(i64, i64, i64)> {
    require!(
        match_timestamp > current_time + 86400,
        ErrorCode::MatchTooSoon
    );
    
    let primary_market_close = match_timestamp - 300; // 5 minutes before
    let secondary_market_open = match_timestamp;
    let secondary_market_close = match_timestamp + 6300; // 105 minutes after
    
    Ok((primary_market_close, secondary_market_open, secondary_market_close))
}

/// Check if current time is within primary market window
pub fn is_primary_market_active(
    current_time: i64,
    primary_market_close: i64,
) -> bool {
    current_time < primary_market_close
}

/// Check if current time is within secondary market window
pub fn is_secondary_market_active(
    current_time: i64,
    secondary_market_open: i64,
    secondary_market_close: i64,
) -> bool {
    current_time >= secondary_market_open && current_time < secondary_market_close
}

/// Calculate platform fee
pub fn calculate_fee(amount: u64, fee_basis_points: u16) -> u64 {
    (amount * fee_basis_points as u64) / 10000
}

/// Calculate total cost including fee
pub fn calculate_total_cost(base_amount: u64, fee_basis_points: u16) -> u64 {
    let fee = calculate_fee(base_amount, fee_basis_points);
    base_amount + fee
}

/// Validate string length constraints
pub fn validate_string_length(value: &str, max_length: usize) -> Result<()> {
    require!(value.len() <= max_length, ErrorCode::InvalidInput);
    require!(!value.is_empty(), ErrorCode::InvalidInput);
    Ok(())
}

/// Calculate current market price from order book bids
pub fn calculate_market_price(best_yes_bid: u64, best_no_bid: u64) -> (u64, u64) {
    if best_yes_bid == 0 && best_no_bid == 0 {
        // No orders, return equal probability
        return (LAMPORTS_PER_SOL / 2, LAMPORTS_PER_SOL / 2);
    }
    
    if best_yes_bid == 0 {
        // Only NO bids exist
        return (0, LAMPORTS_PER_SOL);
    }
    
    if best_no_bid == 0 {
        // Only YES bids exist
        return (LAMPORTS_PER_SOL, 0);
    }
    
    // Calculate implied probability from bids
    let total_bids = best_yes_bid + best_no_bid;
    let yes_price = (best_yes_bid * LAMPORTS_PER_SOL) / total_bids;
    let no_price = LAMPORTS_PER_SOL - yes_price;
    
    (yes_price, no_price)
}

/// Generate unique order ID
pub fn generate_order_id(user: &Pubkey, event_id: &str, timestamp: i64) -> String {
    format!("{}_{}__{}", user.to_string()[..8].to_string(), event_id, timestamp)
}

/// Validate share quantity constraints
pub fn validate_share_quantity(
    quantity: u32,
    max_available: u32,
    current_minted: u32,
) -> Result<()> {
    require!(quantity > 0, ErrorCode::InvalidOrderQuantity);
    require!(
        current_minted + quantity <= max_available,
        ErrorCode::MaxSharesExceeded
    );
    Ok(())
}

/// Validate order price constraints
pub fn validate_order_price(price: u64) -> Result<()> {
    require!(
        price > 0 && price < LAMPORTS_PER_SOL,
        ErrorCode::InvalidOrderPrice
    );
    Ok(())
}

/// Check if two orders can be matched (YES + NO = 1 SOL)
pub fn can_match_orders(yes_price: u64, no_price: u64) -> bool {
    yes_price + no_price == LAMPORTS_PER_SOL
}

/// Calculate payout amount for winning shares
pub fn calculate_payout(winning_shares: u32) -> u64 {
    winning_shares as u64 * LAMPORTS_PER_SOL
}

/// Validate admin permissions
pub fn validate_admin(expected_admin: &Pubkey, actual_admin: &Pubkey) -> Result<()> {
    require!(
        expected_admin == actual_admin,
        ErrorCode::Unauthorized
    );
    Ok(())
}

/// Check if system is not paused
pub fn validate_system_active(is_paused: bool) -> Result<()> {
    require!(!is_paused, ErrorCode::SystemPaused);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_opta_odds() {
        // Test case: 60% YES with margin
        let (yes_bp, no_bp) = normalize_opta_odds(6000);
        assert_eq!(yes_bp + no_bp, 10000);
        assert!(yes_bp > no_bp);
    }

    #[test]
    fn test_calculate_share_prices() {
        let (yes_price, no_price) = calculate_share_prices(6000);
        assert_eq!(yes_price + no_price, LAMPORTS_PER_SOL);
        assert!(yes_price > no_price);
    }

    #[test]
    fn test_calculate_fee() {
        let fee = calculate_fee(1000000000, 200); // 1 SOL, 2%
        assert_eq!(fee, 20000000); // 0.02 SOL
    }

    #[test]
    fn test_can_match_orders() {
        assert!(can_match_orders(600000000, 400000000)); // 0.6 + 0.4 = 1.0
        assert!(!can_match_orders(700000000, 400000000)); // 0.7 + 0.4 = 1.1
    }
}