use anchor_lang::prelude::*;

/// Admin system state - super admins only
#[account]
pub struct AdminHierarchy {
    /// Super admins (max 10) - full system control
    pub super_admins: Vec<Pubkey>,
    /// Bump seed for PDA
    pub bump: u8,
}

impl AdminHierarchy {
    /// Maximum number of super admins allowed
    pub const MAX_SUPER_ADMINS: usize = 10;

    /// Base space calculation for the account
    /// 8 (discriminator) + 4 (vec length) + 32*10 (max super admins) + 1 (bump)
    pub const INIT_SPACE: usize = 8 + 4 + (32 * Self::MAX_SUPER_ADMINS) + 1;

    /// Check if pubkey is a super admin
    pub fn is_super_admin(&self, pubkey: &Pubkey) -> bool {
        self.super_admins.contains(pubkey)
    }

    /// Get current super admin count
    pub fn get_super_admin_count(&self) -> u8 {
        self.super_admins.len() as u8
    }

    /// Add a new super admin with validation
    pub fn add_super_admin(&mut self, new_admin: Pubkey) -> Result<()> {
        require!(
            self.super_admins.len() < Self::MAX_SUPER_ADMINS,
            crate::error::ErrorCode::MaxSuperAdminsExceeded
        );
        require!(
            !self.is_super_admin(&new_admin),
            crate::error::ErrorCode::AdminAlreadyExists
        );

        self.super_admins.push(new_admin);
        Ok(())
    }

    /// Remove a super admin with validation
    pub fn remove_super_admin(&mut self, admin_to_remove: Pubkey) -> Result<()> {
        require!(
            self.super_admins.len() > 1,
            crate::error::ErrorCode::CannotRemoveLastSuperAdmin
        );

        let position = self.super_admins.iter().position(|&x| x == admin_to_remove)
            .ok_or(crate::error::ErrorCode::AdminNotFound)?;

        self.super_admins.remove(position);
        Ok(())
    }
}