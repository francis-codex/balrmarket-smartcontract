use anchor_lang::prelude::*;
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    SecondaryOrder, SecondaryOrderStatus, SecondaryBid, SecondaryBidStatus,
    BID_EXPIRY_SECONDS, LAMPORTS_PER_SOL
};
use crate::events::SecondaryBidPlaced;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(bid_id: u64, event_id: String, order_id: u64)]
pub struct PlaceSecondaryBid<'info> {
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
        seeds = [b"secondary_order", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump,
        constraint = secondary_order.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = secondary_order.order_id == order_id @ ErrorCode::OrderNotFound
    )]
    pub secondary_order: Account<'info, SecondaryOrder>,

    #[account(
        init,
        payer = buyer,
        space = 8 + SecondaryBid::INIT_SPACE,
        seeds = [b"secondary_bid", event_id.as_bytes(), bid_id.to_le_bytes().as_ref()],
        bump
    )]
    pub secondary_bid: Account<'info, SecondaryBid>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PlaceSecondaryBid>,
    bid_id: u64,
    event_id: String,
    order_id: u64,
    bid_price: u64,
    quantity: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let secondary_order = &ctx.accounts.secondary_order;
    let secondary_bid = &mut ctx.accounts.secondary_bid;

    //  VALIDATIONS 

    // Validate order is active and can accept bids
    require!(
        secondary_order.status == SecondaryOrderStatus::Active ||
        secondary_order.status == SecondaryOrderStatus::PartiallyFilled,
        ErrorCode::OrderNotActive
    );

    // Validate order has not expired
    require!(
        current_time <= secondary_order.expires_at,
        ErrorCode::OrderExpired
    );

    // Validate bid quantity doesn't exceed remaining order quantity
    require!(
        quantity > 0 && quantity <= secondary_order.remaining_quantity,
        ErrorCode::InvalidBidQuantity
    );

    // Validate bid price is within acceptable range
    require!(
        bid_price > 0 && bid_price < LAMPORTS_PER_SOL,
        ErrorCode::InvalidSecondaryPrice
    );

    // Validate buyer is not the seller (prevent self-trading)
    require!(
        ctx.accounts.buyer.key() != secondary_order.seller,
        ErrorCode::CannotTradeWithSelf
    );

    // Validate bid ID is unique
    require!(
        bid_id > 0,
        ErrorCode::InvalidInput
    );

    //  CREATE SECONDARY BID 

    let expires_at = current_time
        .checked_add(BID_EXPIRY_SECONDS)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    secondary_bid.bid_id = bid_id;
    secondary_bid.order_id = order_id;
    secondary_bid.event_id = event_id.clone();
    secondary_bid.buyer = ctx.accounts.buyer.key();
    secondary_bid.bid_price = bid_price;
    secondary_bid.quantity = quantity;
    secondary_bid.status = SecondaryBidStatus::Pending;
    secondary_bid.created_at = current_time;
    secondary_bid.expires_at = expires_at;
    secondary_bid.accepted_at = None;
    secondary_bid.bump = ctx.bumps.secondary_bid;

    //  EMIT EVENT 

    emit!(SecondaryBidPlaced {
        event_id,
        order_id,
        bid_id,
        buyer: ctx.accounts.buyer.key(),
        bid_price,
        quantity,
        timestamp: current_time,
    });

    Ok(())
}
