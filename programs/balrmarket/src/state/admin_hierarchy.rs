use anchor_lang::prelude::*;

/// Hierarchical admin system state
#[account]
pub struct AdminHierarchy {
    /// Super admins (max 3) - full system control including admin management
    pub super_admins: Vec<Pubkey>,
    /// Regular admins (unlimited) - standard admin privileges excluding admin management  
    pub regular_admins: Vec<Pubkey>,
    /// Bump seed for PDA
    pub bump: u8,
}

impl AdminHierarchy {
    /// Maximum number of super admins allowed
    pub const MAX_SUPER_ADMINS: usize = 3;
    
    /// Base space calculation for the account
    /// 8 (discriminator) + 4 (vec length) + 32*3 (max super admins) + 4 (vec length) + 32*50 (estimated regular admins) + 1 (bump)
    /// This is a conservative estimate - actual space will be allocated dynamically
    pub const INIT_SPACE: usize = 8 + 4 + (32 * Self::MAX_SUPER_ADMINS) + 4 + (32 * 50) + 1;

    /// Check if pubkey is a super admin
    pub fn is_super_admin(&self, pubkey: &Pubkey) -> bool {
        self.super_admins.contains(pubkey)
    }

    /// Check if pubkey is a regular admin
    pub fn is_regular_admin(&self, pubkey: &Pubkey) -> bool {
        self.regular_admins.contains(pubkey)
    }

    /// Check if pubkey is any type of admin
    pub fn is_any_admin(&self, pubkey: &Pubkey) -> bool {
        self.is_super_admin(pubkey) || self.is_regular_admin(pubkey)
    }

    /// Get current super admin count
    pub fn get_super_admin_count(&self) -> u8 {
        self.super_admins.len() as u8
    }

    /// Get current regular admin count
    pub fn get_regular_admin_count(&self) -> u16 {
        self.regular_admins.len() as u16
    }

    /// Add a new super admin with validation
    pub fn add_super_admin(&mut self, new_admin: Pubkey) -> Result<()> {
        require!(
            self.super_admins.len() < Self::MAX_SUPER_ADMINS,
            crate::error::ErrorCode::MaxSuperAdminsExceeded
        );
        require!(
            !self.is_any_admin(&new_admin),
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

    /// Add a new regular admin with validation
    pub fn add_regular_admin(&mut self, new_admin: Pubkey) -> Result<()> {
        require!(
            !self.is_any_admin(&new_admin),
            crate::error::ErrorCode::AdminAlreadyExists
        );
        
        self.regular_admins.push(new_admin);
        Ok(())
    }

    /// Remove a regular admin
    pub fn remove_regular_admin(&mut self, admin_to_remove: Pubkey) -> Result<()> {
        let position = self.regular_admins.iter().position(|&x| x == admin_to_remove)
            .ok_or(crate::error::ErrorCode::AdminNotFound)?;
        
        self.regular_admins.remove(position);
        Ok(())
    }

    /// Promote regular admin to super admin
    pub fn promote_admin(&mut self, admin_to_promote: Pubkey) -> Result<()> {
        require!(
            self.super_admins.len() < Self::MAX_SUPER_ADMINS,
            crate::error::ErrorCode::MaxSuperAdminsExceeded
        );
        require!(
            self.is_regular_admin(&admin_to_promote),
            crate::error::ErrorCode::AdminNotFound
        );

        // Remove from regular admins
        let position = self.regular_admins.iter().position(|&x| x == admin_to_promote).unwrap();
        self.regular_admins.remove(position);
        
        // Add to super admins
        self.super_admins.push(admin_to_promote);
        Ok(())
    }

    /// Demote super admin to regular admin
    pub fn demote_super_admin(&mut self, admin_to_demote: Pubkey) -> Result<()> {
        require!(
            self.super_admins.len() > 1,
            crate::error::ErrorCode::CannotRemoveLastSuperAdmin
        );
        require!(
            self.is_super_admin(&admin_to_demote),
            crate::error::ErrorCode::AdminNotFound
        );

        // Remove from super admins
        let position = self.super_admins.iter().position(|&x| x == admin_to_demote).unwrap();
        self.super_admins.remove(position);
        
        // Add to regular admins
        self.regular_admins.push(admin_to_demote);
        Ok(())
    }
}

/// Admin role enum for clarity
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AdminRole {
    SuperAdmin,
    RegularAdmin,
}