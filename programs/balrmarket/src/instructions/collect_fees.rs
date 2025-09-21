use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{GlobalState, Event, EventStatus, AdminHierarchy};
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
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_any_admin(&admin.key()) @ ErrorCode::Unauthorized
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,
    
    #[account(
        mut,
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.status == EventStatus::PrimaryClosed @ ErrorCode::PrimaryNotClosed,
        constraint = event.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub event: Account<'info, Event>,
    
    #[account()]
    pub admin: Signer<'info>,
    
    /// Admin wallet to receive platform fees
    #[account(mut)]
    pub admin_wallet: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CollectFees>,
    event_id: String,
) -> Result<()> {
    require!(
        ctx.accounts.event.total_platform_fees > 0,
        ErrorCode::NoFeesToCollect
    );
    
    let fees_to_collect = ctx.accounts.event.total_platform_fees;
    
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.event.to_account_info(),
                to: ctx.accounts.admin_wallet.to_account_info(),
            },
        ),
        fees_to_collect,
    )?;
    
    let event = &mut ctx.accounts.event;
    event.total_platform_fees = 0;
    
    emit!(PlatformFeesCollected {
        event_id,
        admin: ctx.accounts.admin.key(),
        amount: fees_to_collect,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}