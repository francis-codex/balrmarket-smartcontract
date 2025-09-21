use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;
use crate::events::RegularAdminRemoved;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct RemoveRegularAdmin<'info> {
    #[account(
        mut,
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&super_admin.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,
    
    #[account()]
    pub super_admin: Signer<'info>,
}

pub fn handler(
    ctx: Context<RemoveRegularAdmin>,
    admin_to_remove: Pubkey,
) -> Result<()> {
    let admin_hierarchy = &mut ctx.accounts.admin_hierarchy;
    
    // Remove the regular admin with built-in validation
    admin_hierarchy.remove_regular_admin(admin_to_remove)?;
    
    emit!(RegularAdminRemoved {
        removed_admin: admin_to_remove,
        removed_by: ctx.accounts.super_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}