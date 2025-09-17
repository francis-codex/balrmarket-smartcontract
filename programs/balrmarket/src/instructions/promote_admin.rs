use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;
use crate::events::AdminPromoted;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct PromoteAdmin<'info> {
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
    ctx: Context<PromoteAdmin>,
    admin_to_promote: Pubkey,
) -> Result<()> {
    let admin_hierarchy = &mut ctx.accounts.admin_hierarchy;
    
    // Promote regular admin to super admin with built-in validation
    admin_hierarchy.promote_admin(admin_to_promote)?;
    
    emit!(AdminPromoted {
        promoted_admin: admin_to_promote,
        promoted_by: ctx.accounts.super_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}