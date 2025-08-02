use anchor_lang::prelude::*;

#[account]
pub struct Order {
    pub order_id: u64,
    pub event_id: String,
    pub buyer: Pubkey,
    pub order_type: OrderType,
    pub quantity: u64,
    pub unit_price: u64,
    pub total_amount: u64,
    pub status: OrderStatus,
    pub created_at: i64,
    pub bump: u8,
}

impl Order {
    pub const INIT_SPACE: usize = 
        8 +         // order_id
        4 + 50 +    // event_id (String)
        32 +        // buyer
        1 +         // order_type
        8 +         // quantity
        8 +         // unit_price
        8 +         // total_amount
        1 +         // status
        8 +         // created_at
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OrderType {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OrderStatus {
    Pending,
    Matched,
    Cancelled,
}

#[account]
pub struct EscrowAccount {
    pub order_id: u64,
    pub event_id: String,
    pub amount: u64,
    pub bump: u8,
}

impl EscrowAccount {
    pub const INIT_SPACE: usize = 
        8 +         // order_id
        4 + 50 +    // event_id (String)
        8 +         // amount
        1;          // bump
}