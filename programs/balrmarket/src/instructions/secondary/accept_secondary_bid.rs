use anchor_lang::prelude::*;
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    SecondaryOrder, SecondaryOrderStatus, SecondaryBid, SecondaryBidStatus
};
use crate::events::SecondaryBidAccepted;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String, order_id: u64, bid_id: u64)]
pub struct AcceptSecondaryBid<'info> {
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
        seeds = [b"secondary_bid", event_id.as_bytes(), bid_id.to_le_bytes().as_ref()],
        bump,
        constraint = secondary_bid.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = secondary_bid.bid_id == bid_id @ ErrorCode::InvalidInput,
        constraint = secondary_bid.order_id == order_id @ ErrorCode::InvalidInput
    )]
    pub secondary_bid: Account<'info, SecondaryBid>,

    #[account(mut)]
    pub seller: Signer<'info>,
}

pub fn handler(
    ctx: Context<AcceptSecondaryBid>,
    event_id: String,
    order_id: u64,
    bid_id: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let secondary_order = &mut ctx.accounts.secondary_order;
    let secondary_bid = &mut ctx.accounts.secondary_bid;

    //  VALIDATIONS 

    // Validate seller is the order owner
    require!(
        secondary_order.seller == ctx.accounts.seller.key(),
        ErrorCode::Unauthorized
    );

    // Validate order is active
    require!(
        secondary_order.status == SecondaryOrderStatus::Active ||
        secondary_order.status == SecondaryOrderStatus::PartiallyFilled,
        ErrorCode::OrderNotActive
    );

    // Validate bid is pending
    require!(
        secondary_bid.status == SecondaryBidStatus::Pending,
        ErrorCode::BidNotAccepted
    );

    // Validate bid has not expired
    require!(
        current_time <= secondary_bid.expires_at,
        ErrorCode::BidExpired
    );

    // Validate bid quantity doesn't exceed remaining order quantity
    require!(
        secondary_bid.quantity <= secondary_order.remaining_quantity,
        ErrorCode::InvalidBidQuantity
    );

    // Validate bid matches the correct order
    require!(
        secondary_bid.order_id == order_id,
        ErrorCode::InvalidInput
    );

    //  UPDATE BID STATUS 

    secondary_bid.status = SecondaryBidStatus::Accepted;
    secondary_bid.accepted_at = Some(current_time);

    //  UPDATE ORDER STATUS 

    // Calculate new remaining quantity
    let new_remaining = secondary_order.remaining_quantity
        .checked_sub(secondary_bid.quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    secondary_order.remaining_quantity = new_remaining;

    // Update order status based on remaining quantity
    if new_remaining == 0 {
        secondary_order.status = SecondaryOrderStatus::Filled;
    } else {
        secondary_order.status = SecondaryOrderStatus::PartiallyFilled;
    }

    //  EMIT EVENT 

    emit!(SecondaryBidAccepted {
        event_id,
        order_id,
        bid_id,
        seller: ctx.accounts.seller.key(),
        buyer: secondary_bid.buyer,
        timestamp: current_time,
    });

    Ok(())
}
