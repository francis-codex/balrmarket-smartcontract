use anchor_lang::prelude::*;

#[account]
pub struct OrderBook {
    pub event_id: String,
    pub market_phase: MarketPhase,
    pub yes_orders: Vec<Order>,
    pub no_orders: Vec<Order>,
    pub best_yes_bid: u64,
    pub best_no_bid: u64,
    pub total_yes_volume: u64,
    pub total_no_volume: u64,
    pub last_price_update: i64,
    pub bump: u8,
}

impl OrderBook {
    pub const INIT_SPACE: usize = 
        4 + 50 +    // event_id
        1 +         // market_phase
        4 + (48 * 100) + // yes_orders (assuming max 100 orders, 48 bytes per order)
        4 + (48 * 100) + // no_orders
        8 + 8 +     // best bids
        8 + 8 +     // volumes
        8 +         // last_price_update
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Order {
    pub user: Pubkey,
    pub quantity: u32,
    pub price: u64,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MarketPhase {
    Primary,
    Secondary,
}