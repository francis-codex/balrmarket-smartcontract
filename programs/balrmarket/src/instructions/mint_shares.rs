use anchor_lang::prelude::*;
use crate::state::{GlobalState, Event, ShareToken, MatchedPair};
use crate::state::share_token::ShareType;
use crate::events::ShareMinted;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String, matched_pair_id: u64)]
pub struct MintShares<'info> {
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
        init,
        payer = mint_authority,
        space = 8 + ShareToken::INIT_SPACE,
        seeds = [
            b"share", 
            event_id.as_bytes(), 
            matched_pair.yes_buyer.as_ref(), 
            ShareType::Yes.as_bytes()
        ],
        bump
    )]
    pub yes_share_token: Account<'info, ShareToken>,
    
    #[account(
        init,
        payer = mint_authority,
        space = 8 + ShareToken::INIT_SPACE,
        seeds = [
            b"share", 
            event_id.as_bytes(), 
            matched_pair.no_buyer.as_ref(), 
            ShareType::No.as_bytes()
        ],
        bump
    )]
    pub no_share_token: Account<'info, ShareToken>,
    
    #[account(mut)]
    pub mint_authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MintShares>,
    event_id: String,
    matched_pair_id: u64,
) -> Result<()> {
    let matched_pair = &ctx.accounts.matched_pair;
    let event = &ctx.accounts.event;
    
    // Enhanced validation for share minting
    require!(matched_pair.event_id == event_id, ErrorCode::InvalidInput);
    
    // Validate share quantity bounds
    require!(
        matched_pair.quantity > 0 && matched_pair.quantity <= 500,
        ErrorCode::InvalidOrderQuantity
    );
    
    // Ensure buyers are different (prevent self-trading)
    require!(
        matched_pair.yes_buyer != matched_pair.no_buyer,
        ErrorCode::CannotTradeWithSelf
    );
    
    let current_time = Clock::get()?.unix_timestamp;
    
    // Initialize YES share token
    let yes_share_token = &mut ctx.accounts.yes_share_token;
    yes_share_token.event_id = event_id.clone();
    yes_share_token.owner = matched_pair.yes_buyer;
    yes_share_token.share_type = ShareType::Yes;
    yes_share_token.quantity = matched_pair.quantity;
    yes_share_token.mint_authority = ctx.accounts.mint_authority.key();
    yes_share_token.created_at = current_time;
    yes_share_token.bump = ctx.bumps.yes_share_token;
    
    // Initialize NO share token
    let no_share_token = &mut ctx.accounts.no_share_token;
    no_share_token.event_id = event_id.clone();
    no_share_token.owner = matched_pair.no_buyer;
    no_share_token.share_type = ShareType::No;
    no_share_token.quantity = matched_pair.quantity;
    no_share_token.mint_authority = ctx.accounts.mint_authority.key();
    no_share_token.created_at = current_time;
    no_share_token.bump = ctx.bumps.no_share_token;
    
    // Emit ShareMinted event
    emit!(ShareMinted {
        event_id,
        yes_buyer: matched_pair.yes_buyer,
        no_buyer: matched_pair.no_buyer,
        quantity: matched_pair.quantity,
        yes_share_token: ctx.accounts.yes_share_token.key(),
        no_share_token: ctx.accounts.no_share_token.key(),
        timestamp: current_time,
    });
    
    Ok(())
}