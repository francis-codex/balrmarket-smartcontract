use anchor_lang::prelude::*;
use crate::state::MarketStatus;

/// Comprehensive response structure for Market queries
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MarketResponse {
    /// Market account public key
    pub market_pubkey: Pubkey,
    /// Unique market identifier
    pub market_id: String,
    /// Team A name
    pub team_a: String,
    /// Team B name
    pub team_b: String,
    /// Match timestamp
    pub match_timestamp: i64,
    /// Market creation timestamp
    pub created_at: i64,
    /// Market administrator
    pub admin: Pubkey,
    /// Current market status
    pub status: MarketStatus,
    /// Total number of events in this market
    pub total_events: u8,
}

impl MarketResponse {
    pub fn from_account(
        market_pubkey: Pubkey,
        market: &crate::state::Market,
    ) -> Self {
        Self {
            market_pubkey,
            market_id: market.market_id.clone(),
            team_a: market.team_a.clone(),
            team_b: market.team_b.clone(),
            match_timestamp: market.match_timestamp,
            created_at: market.created_at,
            admin: market.admin,
            status: market.status.clone(),
            total_events: market.total_events,
        }
    }
}
