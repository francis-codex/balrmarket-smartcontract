use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;
use crate::events::AdminHierarchyInitialized;

#[derive(Accounts)]
pub struct InitializeAdminHierarchy<'info> {
    #[account(
        init,
        payer = initial_super_admin,
        space = 8 + AdminHierarchy::INIT_SPACE,
        seeds = [b"admin_hierarchy"],
        bump
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,
    
    #[account(mut)]
    pub initial_super_admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeAdminHierarchy>,
) -> Result<()> {
    let admin_hierarchy = &mut ctx.accounts.admin_hierarchy;

    // Initialize with the deployer as the first super admin
    admin_hierarchy.super_admins = vec![ctx.accounts.initial_super_admin.key()];
    admin_hierarchy.bump = ctx.bumps.admin_hierarchy;

    emit!(AdminHierarchyInitialized {
        initial_super_admin: ctx.accounts.initial_super_admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}