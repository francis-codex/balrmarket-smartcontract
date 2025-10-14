use anchor_lang::prelude::*;
use crate::state::EventStatus;

/// Comprehensive response structure for Event queries
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct EventResponse {
    /// Event account public key
    pub event_pubkey: Pubkey,
    /// Unique event identifier
    pub event_id: String,
    /// Associated market ID
    pub market_id: String,
    /// Prediction question
    pub question: String,
    /// Maximum total shares available
    pub max_shares_total: u32,
    /// Maximum YES shares
    pub max_shares_yes: u32,
    /// Maximum NO shares
    pub max_shares_no: u32,
    /// Minted YES shares
    pub minted_shares_yes: u32,
    /// Minted NO shares
    pub minted_shares_no: u32,
    /// YES share price in lamports
    pub yes_share_price: u64,
    /// NO share price in lamports
    pub no_share_price: u64,
    /// Event creation timestamp
    pub created_at: i64,
    /// Primary market closing time
    pub primary_market_close: i64,
    /// Secondary market opening time
    pub secondary_market_open: i64,
    /// Secondary market closing time
    pub secondary_market_close: i64,
    /// Resolution timestamp
    pub resolution_timestamp: i64,
    /// Event administrator
    pub admin: Pubkey,
    /// Current event status
    pub status: EventStatus,
    /// Total payout pool
    pub payout_pool: u64,
    /// Winning outcome (None if unresolved)
    pub winning_outcome: Option<bool>,
    /// OPTA probability for YES (u32 fixed-point)
    pub opta_probability_yes: u32,
    /// OPTA probability for NO (u32 fixed-point)
    pub opta_probability_no: u32,
    /// Total YES shares minted (u64)
    pub shares_minted_yes: u64,
    /// Total NO shares minted (u64)
    pub shares_minted_no: u64,
    /// Remaining shares available
    pub remaining_shares: u64,
    /// Total number of matches
    pub total_matches: u64,
    /// Event start time
    pub event_start_time: i64,
    /// Primary market closed timestamp
    pub primary_market_closed_at: Option<i64>,
    /// Total platform fees collected
    pub total_platform_fees: u64,
}

impl EventResponse {
    pub fn from_account(
        event_pubkey: Pubkey,
        event: &crate::state::Event,
    ) -> Self {
        Self {
            event_pubkey,
            event_id: event.event_id.clone(),
            market_id: event.market_id.clone(),
            question: event.question.clone(),
            max_shares_total: event.max_shares_total,
            max_shares_yes: event.max_shares_yes,
            max_shares_no: event.max_shares_no,
            minted_shares_yes: event.minted_shares_yes,
            minted_shares_no: event.minted_shares_no,
            yes_share_price: event.yes_share_price,
            no_share_price: event.no_share_price,
            created_at: event.created_at,
            primary_market_close: event.primary_market_close,
            secondary_market_open: event.secondary_market_open,
            secondary_market_close: event.secondary_market_close,
            resolution_timestamp: event.resolution_timestamp,
            admin: event.admin,
            status: event.status.clone(),
            payout_pool: event.payout_pool,
            winning_outcome: event.winning_outcome,
            opta_probability_yes: event.opta_probability_yes,
            opta_probability_no: event.opta_probability_no,
            shares_minted_yes: event.shares_minted_yes,
            shares_minted_no: event.shares_minted_no,
            remaining_shares: event.remaining_shares,
            total_matches: event.total_matches,
            event_start_time: event.event_start_time,
            primary_market_closed_at: event.primary_market_closed_at,
            total_platform_fees: event.total_platform_fees,
        }
    }
}
