use anchor_lang::prelude::*;

#[event]
pub struct GlobalStateInitialized {
    pub admin: Pubkey,
    pub platform_fee_primary: u16,
    pub platform_fee_secondary: u16,
}

#[event]
pub struct MarketCreated {
    pub market_id: String,
    pub team_a: String,
    pub team_b: String,
    pub match_timestamp: i64,
    pub admin: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct EventCreated {
    pub event_id: String,
    pub market_id: String,
    pub question: String,
    pub shares_yes: u32,
    pub shares_no: u32,
    pub yes_share_price: u64,
    pub no_share_price: u64,
    pub primary_market_close: i64,
    pub secondary_market_open: i64,
    pub secondary_market_close: i64,
    pub admin: Pubkey,
    pub timestamp: i64,
    pub opta_probability_yes: u16,
    pub opta_probability_no: u16,
}

#[event]
pub struct ShareMintedOld {
    pub event_id: String,
    pub yes_owner: Pubkey,
    pub no_owner: Pubkey,
    pub quantity: u32,
    pub timestamp: i64,
}

#[event]
pub struct PrimaryMarketClosed {
    pub event_id: String,
    pub total_yes_minted: u32,
    pub total_no_minted: u32,
    pub unmatched_orders: u32,
    pub timestamp: i64,
}

#[event]
pub struct RefundIssued {
    pub user: Pubkey,
    pub event_id: String,
    pub amount: u64,
    pub share_type: String,
    pub timestamp: i64,
}

#[event]
pub struct ShareListed {
    pub event_id: String,
    pub seller: Pubkey,
    pub share_type: String,
    pub quantity: u32,
    pub price: u64,
    pub order_id: String,
    pub timestamp: i64,
}

#[event]
pub struct ShareTransferred {
    pub event_id: String,
    pub from: Pubkey,
    pub to: Pubkey,
    pub share_type: String,
    pub quantity: u32,
    pub price: u64,
    pub timestamp: i64,
}

#[event]
pub struct WinningsDisbursed {
    pub event_id: String,
    pub winner: Pubkey,
    pub winning_outcome: bool,
    pub shares_claimed: u32,
    pub payout_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct MarketResolved {
    pub event_id: String,
    pub market_id: String,
    pub winning_outcome: bool,
    pub total_payout_pool: u64,
    pub resolution_timestamp: i64,
}

#[event]
pub struct OrderPlaced {
    pub order_id: u64,
    pub event_id: String,
    pub buyer: Pubkey,
    pub order_type: String,
    pub quantity: u64,
    pub unit_price: u64,
    pub total_amount: u64,
    pub platform_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct OrderMatched {
    pub order_id_1: u64,
    pub order_id_2: u64,
    pub event_id: String,
    pub buyer_1: Pubkey,
    pub buyer_2: Pubkey,
    pub quantity: u64,
    pub unit_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct OrderCancelled {
    pub order_id: u64,
    pub event_id: String,
    pub buyer: Pubkey,
    pub refund_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ShareMinted {
    pub event_id: String,
    pub yes_buyer: Pubkey,
    pub no_buyer: Pubkey,
    pub quantity: u64,
    pub yes_share_token: Pubkey,
    pub no_share_token: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MatchProcessed {
    pub event_id: String,
    pub matched_pair_id: u64,
    pub yes_order_id: u64,
    pub no_order_id: u64,
    pub quantity: u64,
    pub yes_price: u64,
    pub no_price: u64,
    pub timestamp: i64,
}