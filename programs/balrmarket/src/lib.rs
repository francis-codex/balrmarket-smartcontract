#![allow(unexpected_cfgs)]

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;

declare_id!("EUF5zgyR7ZpKbx6kFqGr7FjGCevrCcDuWW9YJXpiuq8H");

#[program]
pub mod balrmarket {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_global_state::handler(ctx)
    }
}
