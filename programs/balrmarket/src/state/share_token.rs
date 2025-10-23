use anchor_lang::prelude::*;

#[account]
pub struct ShareToken {
    pub event_id: String,
    pub owner: Pubkey,
    pub share_type: ShareType,
    pub quantity: u64,
    pub mint_authority: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

impl ShareToken {
    pub const INIT_SPACE: usize = 
        4 + 50 +    // event_id (String)
        32 +        // owner
        1 +         // share_type
        8 +         // quantity
        32 +        // mint_authority
        8 +         // created_at
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ShareType {
    Yes,
    No,
}

impl ShareType {
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            ShareType::Yes => b"yes",
            ShareType::No => b"no",
        }
    }
}

#[account]
pub struct MatchedPair {
    pub event_id: String,
    pub yes_order_id: u64,
    pub no_order_id: u64,
    pub yes_buyer: Pubkey,
    pub no_buyer: Pubkey,
    pub quantity: u64,
    pub yes_price: u64,
    pub no_price: u64,
    pub matched_at: i64,
    pub bump: u8,
}

impl MatchedPair {
    pub const INIT_SPACE: usize = 
        4 + 50 +    // event_id (String)
        8 +         // yes_order_id
        8 +         // no_order_id
        32 +        // yes_buyer
        32 +        // no_buyer
        8 +         // quantity
        8 +         // yes_price
        8 +         // no_price
        8 +         // matched_at
        1;          // bump
}