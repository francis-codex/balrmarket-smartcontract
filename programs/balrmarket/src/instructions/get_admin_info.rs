use anchor_lang::prelude::*;
use crate::state::AdminHierarchy;

#[derive(Accounts)]
pub struct GetAdminInfo<'info> {
    #[account(
        seeds = [b"admin_hierarchy"],
        bump
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,
}

/// View function to get all admin information
pub fn handler(ctx: Context<GetAdminInfo>) -> Result<AdminInfoResponse> {
    let admin_hierarchy = &ctx.accounts.admin_hierarchy;
    
    Ok(AdminInfoResponse {
        super_admins: admin_hierarchy.super_admins.clone(),
        regular_admins: admin_hierarchy.regular_admins.clone(),
        super_admin_count: admin_hierarchy.get_super_admin_count(),
        regular_admin_count: admin_hierarchy.get_regular_admin_count(),
        max_super_admins: AdminHierarchy::MAX_SUPER_ADMINS as u8,
    })
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AdminInfoResponse {
    pub super_admins: Vec<Pubkey>,
    pub regular_admins: Vec<Pubkey>,
    pub super_admin_count: u8,
    pub regular_admin_count: u16,
    pub max_super_admins: u8,
}