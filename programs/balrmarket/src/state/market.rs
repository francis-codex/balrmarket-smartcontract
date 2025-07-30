use anchor_lang::prelude::*;

#[account]
pub struct Market {
    pub market_id: String,
    pub team_a: String,
    pub team_b: String,
    pub match_timestamp: i64,
    pub created_at: i64,
    pub admin: Pubkey,
    pub status: MarketStatus,
    pub total_events: u8,
    pub bump: u8,
}

impl Market {
    pub const INIT_SPACE: usize = 4 + 50 + 4 + 100 + 4 + 100 + 8 + 8 + 32 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MarketStatus {
    Created,
    Active,
    Resolved,
}