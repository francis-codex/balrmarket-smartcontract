use anchor_lang::prelude::*;
use crate::state::ShareType;

// SECONDARY MARKET STATE 

/// Tracks the secondary market status and pricing for a specific event
#[account]
pub struct SecondaryMarketState {
    pub event_id: String,
    pub market_id: String,
    pub status: SecondaryMarketStatus,
    pub opened_at: i64,
    pub closed_at: Option<i64>,
    pub total_trades_settled: u64,
    pub total_volume_sol: u64,
    // Best bid/ask prices (in lamports)
    pub best_yes_bid: u64,
    pub best_yes_ask: u64,
    pub best_no_bid: u64,
    pub best_no_ask: u64,
    pub last_price_update: i64,
    pub bump: u8,
}

impl SecondaryMarketState {
    pub const INIT_SPACE: usize =
        4 + 50 +    // event_id
        4 + 50 +    // market_id
        1 +         // status
        8 +         // opened_at
        1 + 8 +     // closed_at (Option<i64>)
        8 +         // total_trades_settled
        8 +         // total_volume_sol
        8 +         // best_yes_bid
        8 +         // best_yes_ask
        8 +         // best_no_bid
        8 +         // best_no_ask
        8 +         // last_price_update
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum SecondaryMarketStatus {
    Closed,
    Open,
    Paused,
}

//  SECONDARY ORDER 

/// Represents a seller's listing on the secondary market
#[account]
pub struct SecondaryOrder {
    pub order_id: u64,
    pub event_id: String,
    pub seller: Pubkey,
    pub share_type: ShareType,
    pub quantity: u64,
    pub price_per_share: u64,      // In lamports
    pub remaining_quantity: u64,    // For partial fills
    pub status: SecondaryOrderStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub locked_share_token: Pubkey, // Reference to locked ShareToken
    pub bump: u8,
}

impl SecondaryOrder {
    pub const INIT_SPACE: usize =
        8 +         // order_id
        4 + 50 +    // event_id
        32 +        // seller
        1 +         // share_type
        8 +         // quantity
        8 +         // price_per_share
        8 +         // remaining_quantity
        1 +         // status
        8 +         // created_at
        8 +         // expires_at
        32 +        // locked_share_token
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum SecondaryOrderStatus {
    Active,
    PartiallyFilled,
    Filled,
    Cancelled,
    Expired,
}

//  SECONDARY BID 

/// Represents a buyer's bid on a secondary market order
#[account]
pub struct SecondaryBid {
    pub bid_id: u64,
    pub order_id: u64,
    pub event_id: String,
    pub buyer: Pubkey,
    pub bid_price: u64,            // In lamports
    pub quantity: u64,
    pub status: SecondaryBidStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub accepted_at: Option<i64>,
    pub bump: u8,
}

impl SecondaryBid {
    pub const INIT_SPACE: usize =
        8 +         // bid_id
        8 +         // order_id
        4 + 50 +    // event_id
        32 +        // buyer
        8 +         // bid_price
        8 +         // quantity
        1 +         // status
        8 +         // created_at
        8 +         // expires_at
        1 + 8 +     // accepted_at (Option<i64>)
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum SecondaryBidStatus {
    Pending,
    Accepted,
    Rejected,
    Expired,
    Settled,
}

//  SETTLED TRADE 

/// Immutable record of a completed secondary market trade
#[account]
pub struct SettledTrade {
    pub trade_id: u64,
    pub event_id: String,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub share_type: ShareType,
    pub quantity: u64,
    pub price_per_share: u64,
    pub total_amount: u64,         // quantity * price_per_share
    pub platform_fee: u64,
    pub seller_receives: u64,      // total_amount - platform_fee
    pub settled_at: i64,
    pub bump: u8,
}

impl SettledTrade {
    pub const INIT_SPACE: usize =
        8 +         // trade_id
        4 + 50 +    // event_id
        32 +        // seller
        32 +        // buyer
        1 +         // share_type
        8 +         // quantity
        8 +         // price_per_share
        8 +         // total_amount
        8 +         // platform_fee
        8 +         // seller_receives
        8 +         // settled_at
        1;          // bump
}

//  SHARE LOCK 

/// Prevents share misuse during listing period
#[account]
pub struct ShareLock {
    pub share_token: Pubkey,
    pub owner: Pubkey,
    pub event_id: String,
    pub share_type: ShareType,
    pub locked_quantity: u64,
    pub locked_at: i64,
    pub order_id: u64,
    pub status: LockStatus,
    pub bump: u8,
}

impl ShareLock {
    pub const INIT_SPACE: usize =
        32 +        // share_token
        32 +        // owner
        4 + 50 +    // event_id
        1 +         // share_type
        8 +         // locked_quantity
        8 +         // locked_at
        8 +         // order_id
        1 +         // status
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum LockStatus {
    Locked,
    Unlocked,
    Released,
}

//  PAYOUT CLAIM 

/// Tracks payout claims after event resolution
#[account]
pub struct PayoutClaim {
    pub claim_id: u64,
    pub event_id: String,
    pub claimer: Pubkey,
    pub share_type: ShareType,
    pub winning_shares: u64,
    pub payout_amount: u64,
    pub claimed_at: i64,
    pub status: ClaimStatus,
    pub bump: u8,
}

impl PayoutClaim {
    pub const INIT_SPACE: usize =
        8 +         // claim_id
        4 + 50 +    // event_id
        32 +        // claimer
        1 +         // share_type
        8 +         // winning_shares
        8 +         // payout_amount
        8 +         // claimed_at
        1 +         // status
        1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum ClaimStatus {
    Pending,
    Claimed,
    Rejected,
}

//  HELPER STRUCTS 

/// Trade data for batch settlement
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TradeData {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub share_type: ShareType,
    pub quantity: u64,
    pub price_per_share: u64,
    pub seller_signature: [u8; 64],
    pub buyer_signature: [u8; 64],
    pub order_id: u64,
    pub bid_id: u64,
}

/// Price snapshot for historical tracking
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceSnapshot {
    pub yes_bid: u64,
    pub yes_ask: u64,
    pub no_bid: u64,
    pub no_ask: u64,
    pub timestamp: i64,
}

//  CONSTANTS 

/// Maximum number of trades that can be settled in a single batch
pub const MAX_BATCH_TRADES: usize = 100;

/// Maximum platform fee (5% = 500 basis points)
pub const MAX_PLATFORM_FEE_BPS: u16 = 500;

/// Order expiry time (24 hours)
pub const ORDER_EXPIRY_SECONDS: i64 = 86400;

/// Bid expiry time (1 hour)
pub const BID_EXPIRY_SECONDS: i64 = 3600;

/// Minimum order quantity
pub const MIN_ORDER_QUANTITY: u64 = 1;

/// Maximum order quantity
pub const MAX_ORDER_QUANTITY: u64 = 1000;

/// Price snapshot update interval (2 minutes)
pub const PRICE_SNAPSHOT_INTERVAL: i64 = 120;

/// Lamports per SOL
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

//  VALIDATION HELPERS 

impl SecondaryMarketState {
    /// Check if the market is open for trading
    pub fn is_open(&self) -> bool {
        self.status == SecondaryMarketStatus::Open
    }

    /// Check if the market is closed
    pub fn is_closed(&self) -> bool {
        self.status == SecondaryMarketStatus::Closed
    }
}

impl SecondaryOrder {
    /// Check if the order is active
    pub fn is_active(&self) -> bool {
        self.status == SecondaryOrderStatus::Active ||
        self.status == SecondaryOrderStatus::PartiallyFilled
    }

    /// Check if the order has expired
    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time > self.expires_at
    }

    /// Check if the order can accept more bids
    pub fn can_accept_bids(&self) -> bool {
        self.remaining_quantity > 0 && self.is_active()
    }
}

impl SecondaryBid {
    /// Check if the bid is pending
    pub fn is_pending(&self) -> bool {
        self.status == SecondaryBidStatus::Pending
    }

    /// Check if the bid has expired
    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time > self.expires_at
    }

    /// Check if the bid is accepted
    pub fn is_accepted(&self) -> bool {
        self.status == SecondaryBidStatus::Accepted
    }
}

impl ShareLock {
    /// Check if the lock is active
    pub fn is_locked(&self) -> bool {
        self.status == LockStatus::Locked
    }
}

impl PayoutClaim {
    /// Check if the payout has been claimed
    pub fn is_claimed(&self) -> bool {
        self.status == ClaimStatus::Claimed
    }
}

//  PRICE VALIDATION 

/// Validate that a price is within acceptable range (0 < price < 1 SOL)
pub fn validate_price(price: u64) -> bool {
    price > 0 && price < LAMPORTS_PER_SOL
}

/// Validate that bid price is valid for the given ask price
pub fn validate_bid_ask_spread(bid: u64, ask: u64) -> bool {
    bid <= ask
}

/// Calculate platform fee from total amount
pub fn calculate_platform_fee(total_amount: u64, fee_bps: u16) -> Result<u64> {
    let fee = (total_amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok(fee as u64)
}
