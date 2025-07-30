use anchor_lang::prelude::*;

#[account]
pub struct UserPortfolio {
    pub owner: Pubkey,
    pub shares: Vec<UserShare>,
    pub active_orders: Vec<Pubkey>,
    pub total_invested: u64,
    pub total_winnings: u64,
    pub bump: u8,
}

impl UserPortfolio {
    pub const INIT_SPACE: usize = 
        32 +        // owner
        4 + (64 * 50) + // shares (assuming max 50 shares, 64 bytes per share)
        4 + (32 * 20) + // active_orders (assuming max 20 active orders)
        8 +         // total_invested
        8 +         // total_winnings
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UserShare {
    pub event_id: String,
    pub share_type: ShareType,
    pub quantity: u32,
    pub average_price: u64,
    pub acquired_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ShareType {
    Yes,
    No,
}