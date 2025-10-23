use anchor_lang::prelude::*;
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    SecondaryOrder, SecondaryOrderStatus, ShareToken, ShareLock, LockStatus
};
use crate::events::SecondaryOrderCancelled;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String, order_id: u64)]
pub struct CancelSecondaryOrder<'info> {
    #[account(
        seeds = [b"global_state"],
        bump,
        constraint = !global_state.is_paused @ ErrorCode::SystemPaused
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.status == EventStatus::SecondaryActive @ ErrorCode::SecondaryMarketNotOpen
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [b"secondary_market", event_id.as_bytes()],
        bump,
        constraint = secondary_market_state.status == SecondaryMarketStatus::Open @ ErrorCode::SecondaryMarketNotOpen,
        constraint = secondary_market_state.event_id == event_id @ ErrorCode::InvalidInput
    )]
    pub secondary_market_state: Account<'info, SecondaryMarketState>,

    #[account(
        mut,
        seeds = [b"secondary_order", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump,
        constraint = secondary_order.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = secondary_order.order_id == order_id @ ErrorCode::OrderNotFound,
        constraint = secondary_order.seller == seller.key() @ ErrorCode::Unauthorized
    )]
    pub secondary_order: Account<'info, SecondaryOrder>,

    #[account(
        mut,
        constraint = share_token.owner == seller.key() @ ErrorCode::Unauthorized,
        constraint = share_token.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = share_token.is_locked @ ErrorCode::ShareNotLocked
    )]
    pub share_token: Account<'info, ShareToken>,

    #[account(
        mut,
        seeds = [
            b"share_lock",
            share_token.key().as_ref(),
            order_id.to_le_bytes().as_ref()
        ],
        bump,
        constraint = share_lock.order_id == order_id @ ErrorCode::InvalidInput,
        constraint = share_lock.owner == seller.key() @ ErrorCode::Unauthorized
    )]
    pub share_lock: Account<'info, ShareLock>,

    #[account(mut)]
    pub seller: Signer<'info>,
}

pub fn handler(
    ctx: Context<CancelSecondaryOrder>,
    event_id: String,
    order_id: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let secondary_order = &mut ctx.accounts.secondary_order;
    let share_lock = &mut ctx.accounts.share_lock;
    let share_token = &mut ctx.accounts.share_token;

    //  VALIDATIONS 

    // Validate seller is the order owner
    require!(
        secondary_order.seller == ctx.accounts.seller.key(),
        ErrorCode::Unauthorized
    );

    // Validate order is active or partially filled
    require!(
        secondary_order.status == SecondaryOrderStatus::Active ||
        secondary_order.status == SecondaryOrderStatus::PartiallyFilled,
        ErrorCode::OrderNotActive
    );

    // Validate share lock matches this order
    require!(
        share_lock.order_id == order_id,
        ErrorCode::InvalidInput
    );

    // Validate share is locked
    require!(
        share_lock.status == LockStatus::Locked,
        ErrorCode::ShareNotLocked
    );

    //  UPDATE ORDER STATUS 

    secondary_order.status = SecondaryOrderStatus::Cancelled;

    //  RELEASE SHARE LOCK 

    share_lock.status = LockStatus::Released;

    //  UNLOCK SHARE TOKEN 

    share_token.is_locked = false;
    share_token.lock_order_id = None;
    share_token.locked_at = None;

    //  EMIT EVENT 

    emit!(SecondaryOrderCancelled {
        event_id,
        order_id,
        seller: ctx.accounts.seller.key(),
        timestamp: current_time,
    });

    Ok(())
}
