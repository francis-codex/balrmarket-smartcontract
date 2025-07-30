use anchor_lang::prelude::*;

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub total_events: u64,
    pub platform_fee_primary: u16,
    pub platform_fee_secondary: u16,
    pub fee_recipient: Pubkey,
    pub is_paused: bool,
    pub bump: u8,
}

impl GlobalState {
    pub const INIT_SPACE: usize = 32 + 8 + 2 + 2 + 32 + 1 + 1;
}