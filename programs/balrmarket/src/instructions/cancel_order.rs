use anchor_lang::prelude::*;
use crate::state::{GlobalState, Event, Order, EscrowAccount, OrderStatus};
use crate::events::OrderCancelled;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(order_id: u64, event_id: String)]
pub struct CancelOrder<'info> {
    #[account(
        seeds = [b"global_state"],
        bump,
        constraint = !global_state.is_paused @ ErrorCode::SystemPaused
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump,
        constraint = order.buyer == buyer.key() @ ErrorCode::Unauthorized,
        constraint = order.status == OrderStatus::Pending @ ErrorCode::OrderAlreadyFilled,
        close = buyer
    )]
    pub order: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump,
        close = buyer
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CancelOrder>,
    order_id: u64,
    event_id: String,
) -> Result<()> {
    let order = &mut ctx.accounts.order;
    let escrow_account = &ctx.accounts.escrow_account;
    
    // Validate the order can be cancelled
    require!(order.status == OrderStatus::Pending, ErrorCode::OrderAlreadyFilled);
    require!(order.buyer == ctx.accounts.buyer.key(), ErrorCode::Unauthorized);
    
    let refund_amount = escrow_account.amount;
    
    // Transfer SOL back from escrow to buyer
    **ctx.accounts.escrow_account.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
    **ctx.accounts.buyer.to_account_info().try_borrow_mut_lamports()? += refund_amount;
    
    // Update order status
    order.status = OrderStatus::Cancelled;
    
    let current_time = Clock::get()?.unix_timestamp;
    
    // Emit OrderCancelled event
    emit!(OrderCancelled {
        order_id,
        event_id,
        buyer: ctx.accounts.buyer.key(),
        refund_amount,
        timestamp: current_time,
    });
    
    Ok(())
}