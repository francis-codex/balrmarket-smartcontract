use anchor_lang::prelude::*;
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    SecondaryOrder, SecondaryOrderStatus, ShareToken, ShareLock, LockStatus, ShareType,
    ORDER_EXPIRY_SECONDS, MIN_ORDER_QUANTITY, MAX_ORDER_QUANTITY, LAMPORTS_PER_SOL
};
use crate::events::SecondaryShareListed;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(order_id: u64, event_id: String)]
pub struct ListShareForSale<'info> {
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
        seeds = [
            b"share",
            event_id.as_bytes(),
            seller.key().as_ref(),
            share_token.share_type.as_bytes()
        ],
        bump,
        constraint = share_token.owner == seller.key() @ ErrorCode::ShareNotOwned,
        constraint = share_token.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = !share_token.is_locked @ ErrorCode::ShareAlreadyLocked
    )]
    pub share_token: Account<'info, ShareToken>,

    #[account(
        init,
        payer = seller,
        space = 8 + SecondaryOrder::INIT_SPACE,
        seeds = [b"secondary_order", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub secondary_order: Account<'info, SecondaryOrder>,

    #[account(
        init,
        payer = seller,
        space = 8 + ShareLock::INIT_SPACE,
        seeds = [
            b"share_lock",
            share_token.key().as_ref(),
            order_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub share_lock: Account<'info, ShareLock>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ListShareForSale>,
    order_id: u64,
    event_id: String,
    quantity: u64,
    price_per_share: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let share_token = &mut ctx.accounts.share_token;
    let secondary_order = &mut ctx.accounts.secondary_order;
    let share_lock = &mut ctx.accounts.share_lock;

    //  VALIDATIONS 

    // Validate quantity constraints
    require!(
        quantity >= MIN_ORDER_QUANTITY && quantity <= MAX_ORDER_QUANTITY,
        ErrorCode::InvalidOrderQuantity
    );

    // Validate seller owns enough shares
    require!(
        share_token.quantity >= quantity,
        ErrorCode::InsufficientShares
    );

    // Validate price is within acceptable range (0 < price < 1 SOL)
    require!(
        price_per_share > 0 && price_per_share < LAMPORTS_PER_SOL,
        ErrorCode::InvalidSecondaryPrice
    );

    // Validate share is not already locked
    require!(
        !share_token.is_locked,
        ErrorCode::ShareAlreadyLocked
    );

    // Validate order ID is unique (handled by init, but extra safety)
    require!(
        order_id > 0,
        ErrorCode::InvalidInput
    );

    //  SECURITY: LOCK THE SHARES 

    // Lock the share token to prevent double-selling
    share_token.is_locked = true;
    share_token.lock_order_id = Some(order_id);
    share_token.locked_at = Some(current_time);

    //  CREATE SECONDARY ORDER 

    let expires_at = current_time
        .checked_add(ORDER_EXPIRY_SECONDS)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    secondary_order.order_id = order_id;
    secondary_order.event_id = event_id.clone();
    secondary_order.seller = ctx.accounts.seller.key();
    secondary_order.share_type = share_token.share_type.clone();
    secondary_order.quantity = quantity;
    secondary_order.price_per_share = price_per_share;
    secondary_order.remaining_quantity = quantity;
    secondary_order.status = SecondaryOrderStatus::Active;
    secondary_order.created_at = current_time;
    secondary_order.expires_at = expires_at;
    secondary_order.locked_share_token = share_token.key();
    secondary_order.bump = ctx.bumps.secondary_order;

    //  CREATE SHARE LOCK RECORD 

    share_lock.share_token = share_token.key();
    share_lock.owner = ctx.accounts.seller.key();
    share_lock.event_id = event_id.clone();
    share_lock.share_type = share_token.share_type.clone();
    share_lock.locked_quantity = quantity;
    share_lock.locked_at = current_time;
    share_lock.order_id = order_id;
    share_lock.status = LockStatus::Locked;
    share_lock.bump = ctx.bumps.share_lock;

    //  EMIT EVENT 

    let share_type_str = match share_token.share_type {
        ShareType::Yes => "YES",
        ShareType::No => "NO",
    };

    emit!(SecondaryShareListed {
        event_id,
        seller: ctx.accounts.seller.key(),
        share_type: share_type_str.to_string(),
        quantity,
        price_per_share,
        order_id,
        timestamp: current_time,
    });

    Ok(())
}
