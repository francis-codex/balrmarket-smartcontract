use anchor_lang::prelude::*;
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    AdminHierarchy
};
use crate::events::SecondaryMarketResolved;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct ResolveSecondaryMarket<'info> {
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

    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    /// Admin authority
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<ResolveSecondaryMarket>,
    event_id: String,
    winning_outcome: bool,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let event = &mut ctx.accounts.event;
    let secondary_market_state = &mut ctx.accounts.secondary_market_state;
    let admin_hierarchy = &ctx.accounts.admin_hierarchy;

    //  VALIDATIONS 

    // Validate admin authorization (super admin only for resolution)
    require!(
        admin_hierarchy.is_super_admin(&ctx.accounts.authority.key()),
        ErrorCode::Unauthorized
    );

    // Validate match has ended (timestamp check)
    require!(
        current_time >= event.event_start_time,
        ErrorCode::EventNotStarted
    );

    // Validate event is in correct state
    require!(
        event.status == EventStatus::SecondaryActive,
        ErrorCode::SecondaryMarketNotOpen
    );

    // Validate secondary market is open
    require!(
        secondary_market_state.status == SecondaryMarketStatus::Open,
        ErrorCode::SecondaryMarketNotOpen
    );

    //  UPDATE EVENT STATUS 

    event.status = EventStatus::Resolved;
    event.winning_outcome = Some(winning_outcome);

    //  UPDATE SECONDARY MARKET STATE 

    secondary_market_state.status = SecondaryMarketStatus::Closed;
    secondary_market_state.closed_at = Some(current_time);

    // Update event with secondary market closure time
    event.secondary_market_closed_at = Some(current_time);

    //  EMIT EVENT 

    emit!(SecondaryMarketResolved {
        event_id,
        market_id: event.market_id.clone(),
        winning_outcome,
        timestamp: current_time,
    });

    Ok(())
}
