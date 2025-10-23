use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    ShareToken, PayoutClaim, ClaimStatus, ShareType, LAMPORTS_PER_SOL
};
use crate::events::SecondaryPayoutClaimedManual;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct ClaimPayout<'info> {
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
        constraint = claimer_share_token.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = claimer_share_token.owner == claimer.key() @ ErrorCode::Unauthorized
    )]
    pub claimer_share_token: Account<'info, ShareToken>,

    #[account(
        init,
        payer = claimer,
        space = 8 + PayoutClaim::INIT_SPACE,
        seeds = [b"payout_claim", event_id.as_bytes(), claimer.key().as_ref()],
        bump
    )]
    pub payout_claim: Account<'info, PayoutClaim>,

    /// Escrow account holding event funds
    #[account(
        mut,
        seeds = [b"event_escrow", event_id.as_bytes()],
        bump
    )]
    pub event_escrow: SystemAccount<'info>,

    /// Claimer receiving payout
    #[account(mut)]
    pub claimer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ClaimPayout>,
    event_id: String,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let event = &mut ctx.accounts.event;
    let claimer_share_token = &ctx.accounts.claimer_share_token;
    let payout_claim = &mut ctx.accounts.payout_claim;

    //  VALIDATIONS 

    // Validate event is resolved
    require!(
        event.status == EventStatus::Resolved,
        ErrorCode::MarketNotResolved
    );

    // Validate winning outcome is set
    let winning_outcome = event.winning_outcome.ok_or(ErrorCode::MarketNotResolved)?;

    // Determine if claimer has winning shares
    let has_winning_shares = match winning_outcome {
        true => claimer_share_token.share_type == ShareType::Yes,
        false => claimer_share_token.share_type == ShareType::No,
    };

    require!(
        has_winning_shares,
        ErrorCode::NoWinningShares
    );

    // Validate claimer has shares
    require!(
        claimer_share_token.quantity > 0,
        ErrorCode::NoWinningShares
    );

    //  CALCULATE PAYOUT 

    // 1 SOL per winning share
    let payout_amount = claimer_share_token.quantity
        .checked_mul(LAMPORTS_PER_SOL)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    //  TRANSFER PAYOUT FROM ESCROW 

    let event_id_bytes = event_id.as_bytes();
    let bump = ctx.bumps.event_escrow;
    let seeds = &[
        b"event_escrow",
        event_id_bytes,
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.event_escrow.to_account_info(),
                to: ctx.accounts.claimer.to_account_info(),
            },
            signer_seeds,
        ),
        payout_amount,
    )?;

    //  CREATE PAYOUT CLAIM RECORD 

    // Generate claim_id based on timestamp
    let claim_id = current_time as u64;

    payout_claim.claim_id = claim_id;
    payout_claim.event_id = event_id.clone();
    payout_claim.claimer = ctx.accounts.claimer.key();
    payout_claim.share_type = claimer_share_token.share_type.clone();
    payout_claim.winning_shares = claimer_share_token.quantity;
    payout_claim.payout_amount = payout_amount;
    payout_claim.claimed_at = current_time;
    payout_claim.status = ClaimStatus::Claimed;
    payout_claim.bump = ctx.bumps.payout_claim;

    // ===== NOTE: Event totals tracking =====
    // In production, add total_payouts field to Event struct if needed for tracking

    //  EMIT EVENT 

    emit!(SecondaryPayoutClaimedManual {
        event_id,
        claimer: ctx.accounts.claimer.key(),
        share_type: match claimer_share_token.share_type {
            ShareType::Yes => "YES".to_string(),
            ShareType::No => "NO".to_string(),
        },
        winning_shares: claimer_share_token.quantity,
        payout_amount,
        timestamp: current_time,
    });

    Ok(())
}
