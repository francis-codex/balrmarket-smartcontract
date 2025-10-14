use anchor_lang::prelude::*;

/// Comprehensive response structure for MatchedPair queries
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchedPairResponse {
    /// MatchedPair account public key
    pub matched_pair_pubkey: Pubkey,
    /// Associated event ID
    pub event_id: String,
    /// YES order ID
    pub yes_order_id: u64,
    /// NO order ID
    pub no_order_id: u64,
    /// YES buyer wallet address
    pub yes_buyer: Pubkey,
    /// NO buyer wallet address
    pub no_buyer: Pubkey,
    /// Matched quantity
    pub quantity: u64,
    /// YES share price
    pub yes_price: u64,
    /// NO share price
    pub no_price: u64,
    /// Match timestamp
    pub matched_at: i64,
}

impl MatchedPairResponse {
    pub fn from_account(
        matched_pair_pubkey: Pubkey,
        matched_pair: &crate::state::MatchedPair,
    ) -> Self {
        Self {
            matched_pair_pubkey,
            event_id: matched_pair.event_id.clone(),
            yes_order_id: matched_pair.yes_order_id,
            no_order_id: matched_pair.no_order_id,
            yes_buyer: matched_pair.yes_buyer,
            no_buyer: matched_pair.no_buyer,
            quantity: matched_pair.quantity,
            yes_price: matched_pair.yes_price,
            no_price: matched_pair.no_price,
            matched_at: matched_pair.matched_at,
        }
    }
}
