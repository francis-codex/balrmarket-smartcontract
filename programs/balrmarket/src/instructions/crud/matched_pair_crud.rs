use anchor_lang::prelude::*;
use crate::state::MatchedPair;
use crate::instructions::responses::MatchedPairResponse;

/// Get a single matched pair by event_id and matched_pair_id
#[derive(Accounts)]
#[instruction(event_id: String, matched_pair_id: u64)]
pub struct GetMatchedPair<'info> {
    #[account(
        seeds = [b"match", event_id.as_bytes(), matched_pair_id.to_le_bytes().as_ref()],
        bump
    )]
    pub matched_pair: Account<'info, MatchedPair>,
}

pub fn get_matched_pair_handler(
    ctx: Context<GetMatchedPair>,
    _event_id: String,
    _matched_pair_id: u64,
) -> Result<MatchedPairResponse> {
    let matched_pair = &ctx.accounts.matched_pair;

    Ok(MatchedPairResponse::from_account(
        ctx.accounts.matched_pair.key(),
        matched_pair,
    ))
}

/// Get all matched pairs for a specific event
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct GetEventMatches<'info> {
    /// CHECK: This is just used for filtering
    pub event: UncheckedAccount<'info>,
}

pub fn get_event_matches_handler(
    _ctx: Context<GetEventMatches>,
    event_id: String,
) -> Result<Vec<MatchedPairResponse>> {
    msg!("Note: get_event_matches should be called via client-side RPC using getProgramAccounts");
    msg!("Event ID: {}", event_id);

    Ok(vec![])
}

/// Get all matched pairs for a specific user
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct GetUserMatches<'info> {
    /// CHECK: This is just used for filtering
    pub user: UncheckedAccount<'info>,
}

pub fn get_user_matches_handler(
    _ctx: Context<GetUserMatches>,
    user: Pubkey,
    event_filter: Option<String>,
) -> Result<Vec<MatchedPairResponse>> {
    msg!("Note: get_user_matches should be called via client-side RPC using getProgramAccounts");
    msg!("User: {}", user);
    if let Some(event) = event_filter {
        msg!("Event filter: {}", event);
    }

    Ok(vec![])
}

/// Get all matched pairs (admin only)
#[derive(Accounts)]
pub struct GetAllMatches<'info> {
    /// CHECK: Admin validation
    pub authority: Signer<'info>,
}

pub fn get_all_matches_handler(
    _ctx: Context<GetAllMatches>,
    event_filter: Option<String>,
) -> Result<Vec<MatchedPairResponse>> {
    msg!("Note: get_all_matches should be called via client-side RPC using getProgramAccounts");
    if let Some(event) = event_filter {
        msg!("Event filter: {}", event);
    }

    Ok(vec![])
}
