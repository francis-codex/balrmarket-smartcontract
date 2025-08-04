use anchor_lang::prelude::*;
use crate::state::{GlobalState, Event, EventStatus};
use crate::events::PlatformFeesCollected;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct CollectFees<'info> {
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
        constraint = event.status == EventStatus::PrimaryClosed @ ErrorCode::PrimaryNotClosed,
        constraint = event.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        constraint = admin.key() == global_state.admin @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,
    
    /// Admin wallet to receive platform fees
    #[account(
        mut,
        constraint = admin_wallet.key() == global_state.admin @ ErrorCode::Unauthorized
    )]
    pub admin_wallet: SystemAccount<'info>,
}

pub fn handler(
    ctx: Context<CollectFees>,
    event_id: String,
) -> Result<()> {
    // Check if there are platform fees to collect
    require!(
        ctx.accounts.event.total_platform_fees > 0,
        ErrorCode::NoFeesToCollect
    );
    
    let fees_to_collect = ctx.accounts.event.total_platform_fees;
    
    // Transfer platform fees from event account to admin wallet
    let event_lamports = ctx.accounts.event.to_account_info().lamports();
    require!(
        event_lamports >= fees_to_collect,
        ErrorCode::InsufficientFunds
    );
    
    **ctx.accounts.event.to_account_info().try_borrow_mut_lamports()? -= fees_to_collect;
    **ctx.accounts.admin_wallet.to_account_info().try_borrow_mut_lamports()? += fees_to_collect;
    
    // Reset the total platform fees to 0
    let event = &mut ctx.accounts.event;
    event.total_platform_fees = 0;
    
    // Emit event
    emit!(PlatformFeesCollected {
        event_id,
        admin: ctx.accounts.admin.key(),
        amount: fees_to_collect,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}