use anchor_lang::prelude::*;
use crate::state::{GlobalState, Market, MarketStatus, AdminHierarchy};
use crate::events::MarketCreated;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct CreateMarket<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_any_admin(&admin.key()) @ ErrorCode::Unauthorized
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", market_id.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateMarket>,
    market_id: String,
    team_a: String,
    team_b: String,
    match_timestamp: i64,
) -> Result<()> {
    require!(market_id.len() <= 50, ErrorCode::MarketIdTooLong);
    require!(team_a.len() <= 100, ErrorCode::TeamNameTooLong);
    require!(team_b.len() <= 100, ErrorCode::TeamNameTooLong);
    require!(!team_a.is_empty() && !team_b.is_empty(), ErrorCode::InvalidInput);
    
    // Match must be at least 1 hour in the future (reduced from 24 hours for flexibility)
    let current_time = Clock::get()?.unix_timestamp;
    require!(match_timestamp > current_time + 3600, ErrorCode::MatchTooSoon);
    
    let global_state = &ctx.accounts.global_state;
    require!(!global_state.is_paused, ErrorCode::SystemPaused);
    
    // Use hierarchical admin validation
    crate::utils::validate_any_admin_hierarchical(&ctx.accounts.admin_hierarchy, &ctx.accounts.admin.key())?;
    
    let market = &mut ctx.accounts.market;
    market.market_id = market_id.clone();
    market.team_a = team_a.clone();
    market.team_b = team_b.clone();
    market.match_timestamp = match_timestamp;
    market.created_at = current_time;
    market.admin = ctx.accounts.admin.key();
    market.status = MarketStatus::Created;
    market.total_events = 0;
    market.bump = ctx.bumps.market;
    
    emit!(MarketCreated {
        market_id,
        team_a,
        team_b,
        match_timestamp,
        admin: ctx.accounts.admin.key(),
        created_at: current_time,
    });
    
    Ok(())
}