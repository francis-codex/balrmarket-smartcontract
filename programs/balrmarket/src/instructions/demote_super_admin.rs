use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;
use crate::events::SuperAdminDemoted;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct DemoteSuperAdmin<'info> {
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
    ctx: Context<DemoteSuperAdmin>,
    admin_to_demote: Pubkey,
) -> Result<()> {
    let admin_hierarchy = &mut ctx.accounts.admin_hierarchy;
    
    // Demote super admin to regular admin with built-in validation
    admin_hierarchy.demote_super_admin(admin_to_demote)?;
    
    emit!(SuperAdminDemoted {
        demoted_admin: admin_to_demote,
        demoted_by: ctx.accounts.super_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}