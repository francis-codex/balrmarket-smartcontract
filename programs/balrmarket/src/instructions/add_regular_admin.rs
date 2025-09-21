use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;
use crate::events::RegularAdminAdded;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct AddRegularAdmin<'info> {
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
    ctx: Context<AddRegularAdmin>,
    new_regular_admin: Pubkey,
) -> Result<()> {
    let admin_hierarchy = &mut ctx.accounts.admin_hierarchy;
    
    // Add the new regular admin with built-in validation
    admin_hierarchy.add_regular_admin(new_regular_admin)?;
    
    emit!(RegularAdminAdded {
        new_regular_admin,
        added_by: ctx.accounts.super_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}