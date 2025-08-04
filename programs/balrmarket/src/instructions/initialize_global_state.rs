use anchor_lang::prelude::*;
use crate::state::GlobalState;
use crate::events::GlobalStateInitialized;

#[derive(Accounts)]
pub struct InitializeGlobalState<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global_state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeGlobalState>,
    admin: Pubkey,
    platform_fee_primary: u16,
    platform_fee_secondary: u16,
) -> Result<()> {
    // SECURITY: Validate platform fee bounds (max 5% = 500 basis points)
    require!(
        platform_fee_primary <= 500,
        crate::error::ErrorCode::InvalidInput
    );
    require!(
        platform_fee_secondary <= 500,
        crate::error::ErrorCode::InvalidInput
    );
    
    let global_state = &mut ctx.accounts.global_state;
    
    global_state.admin = admin;
    global_state.total_events = 0;
    global_state.platform_fee_primary = platform_fee_primary;
    global_state.platform_fee_secondary = platform_fee_secondary;
    global_state.fee_recipient = admin;
    global_state.is_paused = false;
    global_state.bump = ctx.bumps.global_state;
    
    emit!(GlobalStateInitialized {
        admin,
        platform_fee_primary,
        platform_fee_secondary,
    });
    
    Ok(())
}