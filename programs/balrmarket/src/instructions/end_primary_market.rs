use anchor_lang::prelude::*;
use crate::state::{GlobalState, Event, EventStatus};
use crate::events::PrimaryMarketClosed;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct EndPrimaryMarket<'info> {
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
        constraint = event.status == EventStatus::Active @ ErrorCode::PrimaryAlreadyClosed,
        constraint = event.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        constraint = admin.key() == global_state.admin @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,
}

pub fn handler(
    ctx: Context<EndPrimaryMarket>,
    event_id: String,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let current_time = Clock::get()?.unix_timestamp;
    
    // Check if event has started
    require!(
        current_time >= event.event_start_time,
        ErrorCode::EventNotStarted
    );
    
    // Check if primary market is not already closed
    require!(
        event.status != EventStatus::PrimaryClosed,
        ErrorCode::PrimaryAlreadyClosed
    );
    
    // Update event status and timestamp
    event.status = EventStatus::PrimaryClosed;
    event.primary_market_closed_at = Some(current_time);
    
    // Emit event
    emit!(PrimaryMarketClosed {
        event_id,
        timestamp: current_time,
    });
    
    Ok(())
}