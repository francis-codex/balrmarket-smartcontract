use anchor_lang::prelude::*;
use crate::state::{GlobalState, Event, Order, EscrowAccount, MatchedPair, ShareToken, OrderStatus};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String, matched_pair_id: u64)]
pub struct ProcessMatch<'info> {
    #[account(
        seeds = [b"global_state"],
        bump,
        constraint = !global_state.is_paused @ ErrorCode::SystemPaused
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        mut,
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        seeds = [b"match", event_id.as_bytes(), matched_pair_id.to_le_bytes().as_ref()],
        bump
    )]
    pub matched_pair: Account<'info, MatchedPair>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), matched_pair.yes_order_id.to_le_bytes().as_ref()],
        bump,
        constraint = yes_order.buyer == matched_pair.yes_buyer @ ErrorCode::Unauthorized
    )]
    pub yes_order: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), matched_pair.no_order_id.to_le_bytes().as_ref()],
        bump,
        constraint = no_order.buyer == matched_pair.no_buyer @ ErrorCode::Unauthorized
    )]
    pub no_order: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), matched_pair.yes_order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub yes_escrow: Account<'info, EscrowAccount>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), matched_pair.no_order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub no_escrow: Account<'info, EscrowAccount>,
    
    #[account(
        seeds = [
            b"share", 
            event_id.as_bytes(), 
            matched_pair.yes_buyer.as_ref(), 
            b"yes"
        ],
        bump
    )]
    pub yes_share_token: Account<'info, ShareToken>,
    
    #[account(
        seeds = [
            b"share", 
            event_id.as_bytes(), 
            matched_pair.no_buyer.as_ref(), 
            b"no"
        ],
        bump
    )]
    pub no_share_token: Account<'info, ShareToken>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<ProcessMatch>,
    event_id: String,
    _matched_pair_id: u64,
) -> Result<()> {
    let matched_pair = &ctx.accounts.matched_pair;
    let yes_order = &mut ctx.accounts.yes_order;
    let no_order = &mut ctx.accounts.no_order;
    let event = &mut ctx.accounts.event;
    
    // Validate that this matched pair belongs to the correct event
    require!(matched_pair.event_id == event_id, ErrorCode::InvalidInput);
    
    // Validate that share tokens exist and have correct quantities
    let yes_share_token = &ctx.accounts.yes_share_token;
    let no_share_token = &ctx.accounts.no_share_token;
    
    require!(
        yes_share_token.quantity == matched_pair.quantity,
        ErrorCode::InvalidInput
    );
    require!(
        no_share_token.quantity == matched_pair.quantity,
        ErrorCode::InvalidInput
    );
    
    // Update payout pool with the matched amounts
    let total_matched_value = matched_pair.quantity
        .checked_mul(matched_pair.yes_price.checked_add(matched_pair.no_price).unwrap())
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    event.payout_pool = event.payout_pool
        .checked_add(total_matched_value)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Ensure orders are marked as processed
    if yes_order.quantity == 0 && yes_order.status != OrderStatus::Matched {
        yes_order.status = OrderStatus::Matched;
    }
    if no_order.quantity == 0 && no_order.status != OrderStatus::Matched {
        no_order.status = OrderStatus::Matched;
    }
    
    // Additional accounting could be done here:
    // - Update user portfolios
    // - Track trading volumes
    // - Update market statistics
    // - Calculate market maker rewards
    
    Ok(())
}