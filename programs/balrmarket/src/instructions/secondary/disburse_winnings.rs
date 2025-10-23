use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    ShareToken, PayoutClaim, ClaimStatus, ShareType, LAMPORTS_PER_SOL
};
use crate::events::SecondaryWinningsDisbursed;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String, claim_id: u64)]
pub struct DisburseWinnings<'info> {
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
        constraint = event.status == EventStatus::Resolved @ ErrorCode::MarketNotResolved,
        constraint = event.winning_outcome.is_some() @ ErrorCode::MarketNotResolved
    )]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"secondary_market", event_id.as_bytes()],
        bump,
        constraint = secondary_market_state.status == SecondaryMarketStatus::Closed @ ErrorCode::MarketNotResolved,
        constraint = secondary_market_state.event_id == event_id @ ErrorCode::InvalidInput
    )]
    pub secondary_market_state: Account<'info, SecondaryMarketState>,

    #[account(
        mut,
        constraint = winner_share_token.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = winner_share_token.owner == winner.key() @ ErrorCode::Unauthorized
    )]
    pub winner_share_token: Account<'info, ShareToken>,

    #[account(
        init,
        payer = authority,
        space = 8 + PayoutClaim::INIT_SPACE,
        seeds = [b"payout_claim", event_id.as_bytes(), claim_id.to_le_bytes().as_ref()],
        bump
    )]
    pub payout_claim: Account<'info, PayoutClaim>,

    /// Winner receiving payout
    #[account(mut)]
    pub winner: SystemAccount<'info>,

    /// Authority (backend or admin)
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DisburseWinnings>,
    event_id: String,
    claim_id: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let event = &mut ctx.accounts.event;
    let winner_share_token = &ctx.accounts.winner_share_token;
    let payout_claim = &mut ctx.accounts.payout_claim;

    //  VALIDATIONS 

    // Validate event is resolved
    require!(
        event.status == EventStatus::Resolved,
        ErrorCode::MarketNotResolved
    );

    // Validate winning outcome is set
    let winning_outcome = event.winning_outcome.ok_or(ErrorCode::MarketNotResolved)?;

    // Determine if winner has winning shares
    let has_winning_shares = match winning_outcome {
        true => winner_share_token.share_type == ShareType::Yes,
        false => winner_share_token.share_type == ShareType::No,
    };

    require!(
        has_winning_shares,
        ErrorCode::NoWinningShares
    );

    // Validate winner has shares
    require!(
        winner_share_token.quantity > 0,
        ErrorCode::NoWinningShares
    );

    //  CALCULATE PAYOUT 

    // 1 SOL per winning share
    let payout_amount = winner_share_token.quantity
        .checked_mul(LAMPORTS_PER_SOL)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    //  TRANSFER PAYOUT 

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.winner.to_account_info(),
            },
        ),
        payout_amount,
    )?;

    //  CREATE PAYOUT CLAIM RECORD 

    payout_claim.claim_id = claim_id;
    payout_claim.event_id = event_id.clone();
    payout_claim.claimer = ctx.accounts.winner.key();
    payout_claim.share_type = winner_share_token.share_type.clone();
    payout_claim.winning_shares = winner_share_token.quantity;
    payout_claim.payout_amount = payout_amount;
    payout_claim.claimed_at = current_time;
    payout_claim.status = ClaimStatus::Claimed;
    payout_claim.bump = ctx.bumps.payout_claim;

    //  NOTE: Event totals tracking 
    // In production, add total_payouts field to Event struct if needed for tracking

    //  EMIT EVENT

    emit!(SecondaryWinningsDisbursed {
        event_id,
        winner: ctx.accounts.winner.key(),
        share_type: match winner_share_token.share_type {
            ShareType::Yes => "YES".to_string(),
            ShareType::No => "NO".to_string(),
        },
        winning_shares: winner_share_token.quantity,
        payout_amount,
        timestamp: current_time,
    });

    Ok(())
}
