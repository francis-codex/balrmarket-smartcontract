use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{GlobalState, Event, Order, EscrowAccount, OrderType, OrderStatus, EventStatus};
use crate::events::OrderPlaced;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(order_id: u64, event_id: String)]
pub struct PlaceOrder<'info> {
    #[account(
        seeds = [b"global_state"],
        bump,
        constraint = !global_state.is_paused @ ErrorCode::SystemPaused
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        mut,
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump,
        constraint = event.status == EventStatus::Created || event.status == EventStatus::Active @ ErrorCode::PrimaryMarketClosed,
        constraint = event.status != EventStatus::PrimaryClosed @ ErrorCode::PrimaryAlreadyClosed,
        constraint = Clock::get()?.unix_timestamp < event.primary_market_close @ ErrorCode::PrimaryMarketClosed
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        init,
        payer = buyer,
        space = 8 + Order::INIT_SPACE,
        seeds = [b"order", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub order: Account<'info, Order>,
    
    #[account(
        init,
        payer = buyer,
        space = 8 + EscrowAccount::INIT_SPACE,
        seeds = [b"escrow", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    /// Admin wallet to receive platform fees
    #[account(
        mut,
        constraint = admin_wallet.key() == global_state.admin @ ErrorCode::Unauthorized
    )]
    pub admin_wallet: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PlaceOrder>,
    order_id: u64,
    event_id: String,
    order_type: OrderType,
    quantity: u64,
    unit_price: u64,
) -> Result<()> {
    require!(quantity > 0, ErrorCode::InvalidOrderQuantity);
    require!(unit_price > 0, ErrorCode::InvalidOrderPrice);
    require!(!event_id.is_empty(), ErrorCode::InvalidInput);
    
    // Max 1 SOL per share
    require!(
        unit_price < 1_000_000_000, // 1 SOL in lamports
        ErrorCode::InvalidOrderPrice
    );
    
    // Max 500 shares per order
    require!(
        quantity <= 500,
        ErrorCode::InvalidOrderQuantity
    );
    
    let event = &ctx.accounts.event;
    let global_state = &ctx.accounts.global_state;
    
    let remaining_shares = match order_type {
        OrderType::Yes => event.max_shares_yes - event.minted_shares_yes,
        OrderType::No => event.max_shares_no - event.minted_shares_no,
    } as u64;
    
    require!(quantity <= remaining_shares, ErrorCode::MaxSharesExceeded);
    
    let total_amount = quantity
        .checked_mul(unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    let platform_fee = total_amount
        .checked_mul(global_state.platform_fee_primary as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    let _total_cost = total_amount
        .checked_add(platform_fee)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.escrow_account.to_account_info(),
            },
        ),
        total_amount,
    )?;
    
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.admin_wallet.to_account_info(),
            },
        ),
        platform_fee,
    )?;
    
    let current_time = Clock::get()?.unix_timestamp;
    
    let order = &mut ctx.accounts.order;
    order.order_id = order_id;
    order.event_id = event_id.clone();
    order.buyer = ctx.accounts.buyer.key();
    order.order_type = order_type.clone();
    order.quantity = quantity;
    order.unit_price = unit_price;
    order.total_amount = total_amount;
    order.status = OrderStatus::Pending;
    order.created_at = current_time;
    order.bump = ctx.bumps.order;
    
    let escrow_account = &mut ctx.accounts.escrow_account;
    escrow_account.order_id = order_id;
    escrow_account.event_id = event_id.clone();
    escrow_account.amount = total_amount;
    escrow_account.bump = ctx.bumps.escrow_account;
    
    let event = &mut ctx.accounts.event;
    event.total_platform_fees = event.total_platform_fees
        .checked_add(platform_fee)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    emit!(OrderPlaced {
        order_id,
        event_id,
        buyer: ctx.accounts.buyer.key(),
        order_type: match order_type {
            OrderType::Yes => "YES".to_string(),
            OrderType::No => "NO".to_string(),
        },
        quantity,
        unit_price,
        total_amount,
        platform_fee,
        timestamp: current_time,
    });
    
    Ok(())
}