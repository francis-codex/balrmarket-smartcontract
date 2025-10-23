use anchor_lang::prelude::*;
use crate::state::{GlobalState, Event, EventStatus, AdminHierarchy, SecondaryMarketState, SecondaryMarketStatus};
use crate::events::SecondaryMarketOpened;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct OpenSecondaryMarket<'info> {
    #[account(
        seeds = [b"global_state"],
        bump,
        constraint = !global_state.is_paused @ ErrorCode::SystemPaused
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&admin.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    #[account(
        mut,
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.status == EventStatus::PrimaryClosed @ ErrorCode::PrimaryNotClosed,
        constraint = event.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub event: Account<'info, Event>,

    #[account(
        init,
        payer = admin,
        space = 8 + SecondaryMarketState::INIT_SPACE,
        seeds = [b"secondary_market", event_id.as_bytes()],
        bump
    )]
    pub secondary_market_state: Account<'info, SecondaryMarketState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<OpenSecondaryMarket>,
    event_id: String,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let current_time = Clock::get()?.unix_timestamp;

    // Validate event is in correct state
    require!(
        event.status == EventStatus::PrimaryClosed,
        ErrorCode::PrimaryNotClosed
    );

    // Validate secondary market not already opened
    require!(
        event.secondary_market_state.is_none(),
        ErrorCode::SecondaryMarketAlreadyOpen
    );

    // Validate timing - can only open after primary close time
    require!(
        current_time >= event.primary_market_close,
        ErrorCode::PrimaryNotClosed
    );

    // Initialize secondary market state
    let secondary_market_state = &mut ctx.accounts.secondary_market_state;
    secondary_market_state.event_id = event_id.clone();
    secondary_market_state.market_id = event.market_id.clone();
    secondary_market_state.status = SecondaryMarketStatus::Open;
    secondary_market_state.opened_at = current_time;
    secondary_market_state.closed_at = None;
    secondary_market_state.total_trades_settled = 0;
    secondary_market_state.total_volume_sol = 0;
    secondary_market_state.best_yes_bid = 0;
    secondary_market_state.best_yes_ask = 0;
    secondary_market_state.best_no_bid = 0;
    secondary_market_state.best_no_ask = 0;
    secondary_market_state.last_price_update = current_time;
    secondary_market_state.bump = ctx.bumps.secondary_market_state;

    // Update event status and reference
    event.status = EventStatus::SecondaryActive;
    event.secondary_market_state = Some(ctx.accounts.secondary_market_state.key());
    event.secondary_market_opened_at = Some(current_time);
    event.total_secondary_trades = 0;
    event.total_secondary_volume = 0;

    // Emit event
    emit!(SecondaryMarketOpened {
        event_id,
        market_id: event.market_id.clone(),
        timestamp: current_time,
    });

    Ok(())
}
