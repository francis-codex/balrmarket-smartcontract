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
    pub opta_probability_yes: u16,
    pub opta_probability_no: u16,
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
        2 + 2 +     // probabilities
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EventStatus {
    Created,
    PrimaryActive,
    SecondaryActive,
    Resolved,
}