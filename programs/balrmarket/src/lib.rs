#![allow(unexpected_cfgs)]
#[warn(unused_imports)]
#[warn(deprecated)]


pub mod instructions;
pub mod state;
pub mod events;
pub mod error;
pub mod utils;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
pub use events::*;
pub use error::*;
pub use utils::*;

declare_id!("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");

#[program]
pub mod balrmarket {
    use super::*;

    /// Initialize the global state for the platform
    pub fn initialize_global_state(
        ctx: Context<InitializeGlobalState>,
        admin: Pubkey,
        platform_fee_primary: u16,
        platform_fee_secondary: u16,
    ) -> Result<()> {
        instructions::initialize_global_state::handler(
            ctx,
            admin,
            platform_fee_primary,
            platform_fee_secondary,
        )
    }

    /// Create a new market for a football match
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: String,
        team_a: String,
        team_b: String,
        match_timestamp: i64,
    ) -> Result<()> {
        instructions::create_market::handler(
            ctx,
            market_id,
            team_a,
            team_b,
            match_timestamp,
        )
    }

    /// Create a new prediction event within a market
    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: String,
        question: String,
        max_shares: u32,
        opta_odds_yes: u16,
        match_timestamp: i64,
    ) -> Result<()> {
        instructions::create_event::handler(
            ctx,
            event_id,
            question,
            max_shares,
            opta_odds_yes,
            match_timestamp,
        )
    }
}