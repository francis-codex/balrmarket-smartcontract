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

    /// Place a new order with SOL escrow
    pub fn place_order(
        ctx: Context<PlaceOrder>,
        order_id: u64,
        event_id: String,
        order_type: OrderType,
        quantity: u64,
        unit_price: u64,
    ) -> Result<()> {
        instructions::place_order::handler(
            ctx,
            order_id,
            event_id,
            order_type,
            quantity,
            unit_price,
        )
    }

    /// Cancel a pending order and refund SOL
    pub fn cancel_order(
        ctx: Context<CancelOrder>,
        order_id: u64,
        event_id: String,
    ) -> Result<()> {
        instructions::cancel_order::handler(
            ctx,
            order_id,
            event_id,
        )
    }

    /// Match compatible orders automatically
    pub fn match_orders(
        ctx: Context<MatchOrders>,
        event_id: String,
        yes_order_id: u64,
        no_order_id: u64,
    ) -> Result<()> {
        instructions::match_orders::handler(
            ctx,
            event_id,
            yes_order_id,
            no_order_id,
        )
    }

    /// Mint share tokens for matched buyers
    pub fn mint_shares(
        ctx: Context<MintShares>,
        event_id: String,
        matched_pair_id: u64,
    ) -> Result<()> {
        instructions::mint_shares::handler(
            ctx,
            event_id,
            matched_pair_id,
        )
    }

    /// Process match for post-match accounting
    pub fn process_match(
        ctx: Context<ProcessMatch>,
        event_id: String,
        matched_pair_id: u64,
    ) -> Result<()> {
        instructions::process_match::handler(
            ctx,
            event_id,
            matched_pair_id,
        )
    }

    /// End primary market when event starts
    pub fn end_primary_market(
        ctx: Context<EndPrimaryMarket>,
        event_id: String,
    ) -> Result<()> {
        instructions::end_primary_market::handler(
            ctx,
            event_id,
        )
    }

    /// Refund unmatched orders after primary market closure
    pub fn refund_unmatched_orders(
        ctx: Context<RefundOrders>,
        event_id: String,
        order_id: u64,
    ) -> Result<()> {
        instructions::refund_orders::handler(
            ctx,
            event_id,
            order_id,
        )
    }

    /// Collect platform fees accumulated in event
    pub fn collect_platform_fees(
        ctx: Context<CollectFees>,
        event_id: String,
    ) -> Result<()> {
        instructions::collect_fees::handler(
            ctx,
            event_id,
        )
    }
}