use anchor_lang::prelude::*;
use crate::state::{Market, MarketStatus, AdminHierarchy};
use crate::instructions::responses::MarketResponse;
use crate::error::ErrorCode;

/// Get a single market by market_id
#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct GetMarket<'info> {
    #[account(
        seeds = [b"market", market_id.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
}

pub fn get_market_handler(
    ctx: Context<GetMarket>,
    _market_id: String,
) -> Result<MarketResponse> {
    let market = &ctx.accounts.market;

    Ok(MarketResponse::from_account(
        ctx.accounts.market.key(),
        market,
    ))
}

/// Get all markets (with optional status filter)
#[derive(Accounts)]
pub struct GetAllMarkets<'info> {
    /// CHECK: Optional authority
    pub authority: UncheckedAccount<'info>,
}

pub fn get_all_markets_handler(
    _ctx: Context<GetAllMarkets>,
    status_filter: Option<MarketStatus>,
) -> Result<Vec<MarketResponse>> {
    msg!("Note: get_all_markets should be called via client-side RPC using getProgramAccounts");
    if let Some(status) = status_filter {
        msg!("Status filter: {:?}", status);
    }

    Ok(vec![])
}

/// Update market details (admin only)
#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct UpdateMarket<'info> {
    #[account(
        mut,
        seeds = [b"market", market_id.as_bytes()],
        bump,
        constraint = market.admin == authority.key() @ ErrorCode::Unauthorized
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&authority.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn update_market_handler(
    ctx: Context<UpdateMarket>,
    _market_id: String,
    team_a: Option<String>,
    team_b: Option<String>,
    match_timestamp: Option<i64>,
    status: Option<MarketStatus>,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    if let Some(new_team_a) = team_a {
        require!(
            new_team_a.len() <= 100,
            ErrorCode::TeamNameTooLong
        );
        market.team_a = new_team_a;
    }

    if let Some(new_team_b) = team_b {
        require!(
            new_team_b.len() <= 100,
            ErrorCode::TeamNameTooLong
        );
        market.team_b = new_team_b;
    }

    if let Some(new_timestamp) = match_timestamp {
        market.match_timestamp = new_timestamp;
    }

    if let Some(new_status) = status {
        market.status = new_status;
    }

    msg!("Market updated: {}", market.market_id);

    Ok(())
}

/// Deactivate market (admin only)
#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct DeactivateMarket<'info> {
    #[account(
        mut,
        seeds = [b"market", market_id.as_bytes()],
        bump,
        constraint = market.admin == authority.key() @ ErrorCode::Unauthorized
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&authority.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn deactivate_market_handler(
    ctx: Context<DeactivateMarket>,
    _market_id: String,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    market.status = MarketStatus::Resolved;

    msg!("Market deactivated: {}", market.market_id);

    Ok(())
}
