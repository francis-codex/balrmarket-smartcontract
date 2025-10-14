use anchor_lang::prelude::*;
use crate::state::{Event, EventStatus, AdminHierarchy};
use crate::instructions::responses::EventResponse;
use crate::error::ErrorCode;

/// Get a single event by market_id and event_id
#[derive(Accounts)]
#[instruction(market_id: String, event_id: String)]
pub struct GetEvent<'info> {
    #[account(
        seeds = [b"event", market_id.as_bytes(), event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
}

pub fn get_event_handler(
    ctx: Context<GetEvent>,
    _market_id: String,
    _event_id: String,
) -> Result<EventResponse> {
    let event = &ctx.accounts.event;

    Ok(EventResponse::from_account(
        ctx.accounts.event.key(),
        event,
    ))
}

/// Get all events by market
#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct GetEventsByMarket<'info> {
    /// CHECK: This is just used for filtering
    pub market: UncheckedAccount<'info>,
}

pub fn get_events_by_market_handler(
    _ctx: Context<GetEventsByMarket>,
    market_id: String,
    status_filter: Option<EventStatus>,
) -> Result<Vec<EventResponse>> {
    msg!("Note: get_events_by_market should be called via client-side RPC using getProgramAccounts");
    msg!("Market ID: {}", market_id);
    if let Some(status) = status_filter {
        msg!("Status filter: {:?}", status);
    }

    Ok(vec![])
}

/// Get all events (with optional filters)
#[derive(Accounts)]
pub struct GetAllEvents<'info> {
    /// CHECK: Optional authority check
    pub authority: UncheckedAccount<'info>,
}

pub fn get_all_events_handler(
    _ctx: Context<GetAllEvents>,
    status_filter: Option<EventStatus>,
    admin_filter: Option<Pubkey>,
) -> Result<Vec<EventResponse>> {
    msg!("Note: get_all_events should be called via client-side RPC using getProgramAccounts");
    if let Some(status) = status_filter {
        msg!("Status filter: {:?}", status);
    }
    if let Some(admin) = admin_filter {
        msg!("Admin filter: {}", admin);
    }

    Ok(vec![])
}

/// Update event details (admin only)
#[derive(Accounts)]
#[instruction(market_id: String, event_id: String)]
pub struct UpdateEvent<'info> {
    #[account(
        mut,
        seeds = [b"event", market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.admin == authority.key() @ ErrorCode::Unauthorized
    )]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&authority.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn update_event_handler(
    ctx: Context<UpdateEvent>,
    _market_id: String,
    _event_id: String,
    question: Option<String>,
    status: Option<EventStatus>,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    if let Some(new_question) = question {
        require!(
            new_question.len() <= 200,
            ErrorCode::QuestionTooLong
        );
        event.question = new_question;
    }

    if let Some(new_status) = status {
        event.status = new_status;
    }

    msg!("Event updated: {}", event.event_id);

    Ok(())
}

/// Resolve event with winning outcome (admin only)
#[derive(Accounts)]
#[instruction(market_id: String, event_id: String)]
pub struct ResolveEvent<'info> {
    #[account(
        mut,
        seeds = [b"event", market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.admin == authority.key() @ ErrorCode::Unauthorized
    )]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&authority.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn resolve_event_handler(
    ctx: Context<ResolveEvent>,
    _market_id: String,
    _event_id: String,
    winning_outcome: bool,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    require!(
        event.status != EventStatus::Resolved,
        ErrorCode::EventAlreadyResolved
    );

    event.winning_outcome = Some(winning_outcome);
    event.status = EventStatus::Resolved;
    event.resolution_timestamp = Clock::get()?.unix_timestamp;

    msg!("Event resolved: {} - Winning outcome: {}", event.event_id, winning_outcome);

    Ok(())
}

/// Cancel event (admin only)
#[derive(Accounts)]
#[instruction(market_id: String, event_id: String)]
pub struct CancelEvent<'info> {
    #[account(
        mut,
        seeds = [b"event", market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.admin == authority.key() @ ErrorCode::Unauthorized
    )]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&authority.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn cancel_event_handler(
    ctx: Context<CancelEvent>,
    _market_id: String,
    _event_id: String,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    require!(
        event.status != EventStatus::Resolved,
        ErrorCode::EventAlreadyResolved
    );

    // Mark as cancelled (we can add a Cancelled status if needed)
    event.status = EventStatus::Settled;

    msg!("Event cancelled: {}", event.event_id);

    Ok(())
}
