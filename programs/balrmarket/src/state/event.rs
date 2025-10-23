use anchor_lang::prelude::*;

#[account]
pub struct Event {
    pub event_id: String,
    pub market_id: String,
    pub question: String,
    pub max_shares_total: u32,
    pub max_shares_yes: u32,
    pub max_shares_no: u32,
    pub minted_shares_yes: u32,
    pub minted_shares_no: u32,
    pub yes_share_price: u64,
    pub no_share_price: u64,
    pub created_at: i64,
    pub primary_market_close: i64,
    pub secondary_market_open: i64,
    pub secondary_market_close: i64,
    pub resolution_timestamp: i64,
    pub admin: Pubkey,
    pub status: EventStatus,
    pub payout_pool: u64,
    pub winning_outcome: Option<bool>,
    pub opta_probability_yes: u32,
    pub opta_probability_no: u32,
    pub shares_minted_yes: u64,
    pub shares_minted_no: u64,
    pub remaining_shares: u64,
    pub total_matches: u64,
    pub event_start_time: i64,
    pub primary_market_closed_at: Option<i64>,
    pub total_platform_fees: u64,
    pub bump: u8,
}

impl Event {
    pub const INIT_SPACE: usize = 
        4 + 50 +    // event_id
        4 + 50 +    // market_id
        4 + 200 +   // question
        4 + 4 + 4 + 4 + 4 +  // share counts
        8 + 8 +     // prices
        8 + 8 + 8 + 8 + 8 + // timestamps
        32 +        // admin
        1 +         // status
        8 +         // payout_pool
        1 + 1 +     // winning_outcome (Option<bool>)
        4 + 4 +     // probabilities (u32 each)
        8 + 8 +     // shares_minted_yes, shares_minted_no
        8 +         // remaining_shares
        8 +         // total_matches
        8 +         // event_start_time
        1 + 8 +     // primary_market_closed_at (Option<i64>)
        8 +         // total_platform_fees
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum EventStatus {
    Created,
    Active,        // renamed from PrimaryActive for consistency
    PrimaryClosed, // new - primary market closed
    SecondaryActive,
    Settled,       // for future use
    Resolved,
}