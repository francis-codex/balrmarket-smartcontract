use anchor_lang::prelude::*;
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    PRICE_SNAPSHOT_INTERVAL, LAMPORTS_PER_SOL
};
use crate::events::PriceSnapshotUpdated;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct UpdatePriceSnapshot<'info> {
    #[account(
        seeds = [b"global_state"],
        bump,
        constraint = !global_state.is_paused @ ErrorCode::SystemPaused
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.status == EventStatus::SecondaryActive @ ErrorCode::SecondaryMarketNotOpen
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [b"secondary_market", event_id.as_bytes()],
        bump,
        constraint = secondary_market_state.status == SecondaryMarketStatus::Open @ ErrorCode::SecondaryMarketNotOpen,
        constraint = secondary_market_state.event_id == event_id @ ErrorCode::InvalidInput
    )]
    pub secondary_market_state: Account<'info, SecondaryMarketState>,

    /// Pricing authority (backend service)
    #[account(mut)]
    pub pricing_authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdatePriceSnapshot>,
    event_id: String,
    best_yes_bid: u64,
    best_yes_ask: u64,
    best_no_bid: u64,
    best_no_ask: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let secondary_market_state = &mut ctx.accounts.secondary_market_state;

    //  VALIDATIONS 

    // Validate all prices are in valid range
    require!(
        best_yes_bid > 0 && best_yes_bid < LAMPORTS_PER_SOL,
        ErrorCode::InvalidSecondaryPrice
    );
    require!(
        best_yes_ask > 0 && best_yes_ask < LAMPORTS_PER_SOL,
        ErrorCode::InvalidSecondaryPrice
    );
    require!(
        best_no_bid > 0 && best_no_bid < LAMPORTS_PER_SOL,
        ErrorCode::InvalidSecondaryPrice
    );
    require!(
        best_no_ask > 0 && best_no_ask < LAMPORTS_PER_SOL,
        ErrorCode::InvalidSecondaryPrice
    );

    // Validate bid <= ask for each share type
    require!(
        best_yes_bid <= best_yes_ask,
        ErrorCode::PriceOutOfRange
    );
    require!(
        best_no_bid <= best_no_ask,
        ErrorCode::PriceOutOfRange
    );

    // Validate update interval (prevent too frequent updates)
    let time_since_last_update = current_time - secondary_market_state.last_price_update;
    require!(
        time_since_last_update >= PRICE_SNAPSHOT_INTERVAL || secondary_market_state.last_price_update == 0,
        ErrorCode::InvalidInput
    );

    //  UPDATE SECONDARY MARKET STATE 

    secondary_market_state.best_yes_bid = best_yes_bid;
    secondary_market_state.best_yes_ask = best_yes_ask;
    secondary_market_state.best_no_bid = best_no_bid;
    secondary_market_state.best_no_ask = best_no_ask;
    secondary_market_state.last_price_update = current_time;

    //  EMIT EVENT 

    emit!(PriceSnapshotUpdated {
        event_id,
        best_yes_bid,
        best_yes_ask,
        best_no_bid,
        best_no_ask,
        timestamp: current_time,
    });

    Ok(())
}
