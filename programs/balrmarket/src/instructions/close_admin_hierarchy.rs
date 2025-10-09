use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct CloseAdminHierarchy<'info> {
    #[account(
        mut,
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&authority.key()) @ ErrorCode::SuperAdminRequired,
        close = rent_receiver
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// Account to receive the rent from closing the admin hierarchy account
    #[account(mut)]
    pub rent_receiver: SystemAccount<'info>,
}

pub fn handler(
    _ctx: Context<CloseAdminHierarchy>,
) -> Result<()> {
    // The close constraint automatically handles closing the account
    // and transferring lamports to rent_receiver
    msg!("Admin hierarchy closed successfully");
    Ok(())
}
