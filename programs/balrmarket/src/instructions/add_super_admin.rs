use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;
use crate::events::SuperAdminAdded;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct AddSuperAdmin<'info> {
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
    ctx: Context<AddSuperAdmin>,
    new_super_admin: Pubkey,
) -> Result<()> {
    let admin_hierarchy = &mut ctx.accounts.admin_hierarchy;
    
    // Add the new super admin with built-in validation
    admin_hierarchy.add_super_admin(new_super_admin)?;
    
    emit!(SuperAdminAdded {
        new_super_admin,
        added_by: ctx.accounts.super_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}