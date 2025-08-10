use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{Event, Order, EscrowAccount, EventStatus, OrderStatus};
use crate::events::OrderRefunded;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String, order_id: u64)]
pub struct RefundOrders<'info> {
    #[account(
        mut,
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.status == EventStatus::PrimaryClosed @ ErrorCode::PrimaryNotClosed
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump,
        constraint = order.status == OrderStatus::Pending @ ErrorCode::OrderNotPending,
        constraint = order.event_id == event_id @ ErrorCode::InvalidInput
    )]
    pub order: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump,
        constraint = escrow_account.order_id == order_id @ ErrorCode::InvalidInput,
        constraint = escrow_account.event_id == event_id @ ErrorCode::InvalidInput
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    
    /// The original buyer who will receive the refund
    #[account(
        mut,
        constraint = buyer.key() == order.buyer @ ErrorCode::Unauthorized
    )]
    pub buyer: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RefundOrders>,
    event_id: String,
    order_id: u64,
) -> Result<()> {
    let order = &mut ctx.accounts.order;
    let escrow_account = &ctx.accounts.escrow_account;
    
    require!(
        order.status == OrderStatus::Pending,
        ErrorCode::OrderNotPending
    );
    
    let refund_amount = escrow_account.amount;
    
    // Use secure CPI instead of direct lamport manipulation
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.escrow_account.to_account_info(),
                to: ctx.accounts.buyer.to_account_info(),
            },
        ),
        refund_amount,
    )?;
    
    order.status = OrderStatus::Refunded;
    
    emit!(OrderRefunded {
        order_id,
        event_id,
        buyer: order.buyer,
        amount: refund_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}