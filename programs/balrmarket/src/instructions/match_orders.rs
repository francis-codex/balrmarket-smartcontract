use anchor_lang::prelude::*;
use crate::state::{GlobalState, Event, Order, EscrowAccount, OrderType, OrderStatus};
use crate::events::OrderMatched;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(order_id_1: u64, order_id_2: u64, event_id: String)]
pub struct MatchOrders<'info> {
    #[account(
        seeds = [b"global_state"],
        bump,
        constraint = !global_state.is_paused @ ErrorCode::SystemPaused
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        mut,
        seeds = [b"event", event.market_id.as_bytes(), event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), order_id_1.to_le_bytes().as_ref()],
        bump,
        constraint = order_1.status == OrderStatus::Pending @ ErrorCode::OrderAlreadyFilled
    )]
    pub order_1: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), order_id_2.to_le_bytes().as_ref()],
        bump,
        constraint = order_2.status == OrderStatus::Pending @ ErrorCode::OrderAlreadyFilled,
        constraint = order_1.buyer != order_2.buyer @ ErrorCode::CannotTradeWithSelf
    )]
    pub order_2: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), order_id_1.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_account_1: Account<'info, EscrowAccount>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), order_id_2.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_account_2: Account<'info, EscrowAccount>,
    
    #[account(mut)]
    pub buyer_1: SystemAccount<'info>,
    
    #[account(mut)]
    pub buyer_2: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MatchOrders>,
    order_id_1: u64,
    order_id_2: u64,
    event_id: String,
) -> Result<()> {
    let order_1 = &mut ctx.accounts.order_1;
    let order_2 = &mut ctx.accounts.order_2;
    let event = &mut ctx.accounts.event;

    // Validate orders are compatible (opposite types and compatible prices)
    require!(
        (order_1.order_type == OrderType::Yes && order_2.order_type == OrderType::No) ||
        (order_1.order_type == OrderType::No && order_2.order_type == OrderType::Yes),
        ErrorCode::NoMatchingOrder
    );
    
    // Validate price compatibility (sum should be approximately 1 SOL for market making)
    let combined_price = order_1.unit_price
        .checked_add(order_2.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Allow some tolerance for price matching (within 1% of 1 SOL)
    let one_sol = 1_000_000_000; // 1 SOL in lamports
    let tolerance = one_sol / 100; // 1% tolerance
    require!(
        combined_price >= one_sol - tolerance && combined_price <= one_sol + tolerance,
        ErrorCode::InvalidOrderPrice
    );
    
    // Determine match quantity (minimum of both orders)
    let match_quantity = std::cmp::min(order_1.quantity, order_2.quantity);
    require!(match_quantity > 0, ErrorCode::InvalidOrderQuantity);
    
    // Calculate amounts to transfer
    let amount_1 = match_quantity
        .checked_mul(order_1.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let amount_2 = match_quantity
        .checked_mul(order_2.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Transfer escrowed funds to the counterparty
    // Buyer 1 gets their shares worth order_2's price per share
    **ctx.accounts.escrow_account_2.to_account_info().try_borrow_mut_lamports()? -= amount_2;
    **ctx.accounts.buyer_1.to_account_info().try_borrow_mut_lamports()? += amount_2;
    
    // Buyer 2 gets their shares worth order_1's price per share
    **ctx.accounts.escrow_account_1.to_account_info().try_borrow_mut_lamports()? -= amount_1;
    **ctx.accounts.buyer_2.to_account_info().try_borrow_mut_lamports()? += amount_1;
    
    // Update order quantities
    order_1.quantity = order_1.quantity
        .checked_sub(match_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    order_2.quantity = order_2.quantity
        .checked_sub(match_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Update order total amounts
    order_1.total_amount = order_1.quantity
        .checked_mul(order_1.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    order_2.total_amount = order_2.quantity
        .checked_mul(order_2.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Update escrow amounts
    ctx.accounts.escrow_account_1.amount = order_1.total_amount;
    ctx.accounts.escrow_account_2.amount = order_2.total_amount;
    
    // Mark orders as matched if fully filled
    if order_1.quantity == 0 {
        order_1.status = OrderStatus::Matched;
    }
    if order_2.quantity == 0 {
        order_2.status = OrderStatus::Matched;
    }
    
    // Update event share counts
    match order_1.order_type {
        OrderType::Yes => {
            event.minted_shares_yes = event.minted_shares_yes
                .checked_add(match_quantity as u32)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
            event.minted_shares_no = event.minted_shares_no
                .checked_add(match_quantity as u32)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
        },
        OrderType::No => {
            event.minted_shares_no = event.minted_shares_no
                .checked_add(match_quantity as u32)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
            event.minted_shares_yes = event.minted_shares_yes
                .checked_add(match_quantity as u32)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
        },
    }
    
    let current_time = Clock::get()?.unix_timestamp;
    
    // Emit OrderMatched event
    emit!(OrderMatched {
        order_id_1,
        order_id_2,
        event_id,
        buyer_1: order_1.buyer,
        buyer_2: order_2.buyer,
        quantity: match_quantity,
        unit_price: (order_1.unit_price + order_2.unit_price) / 2, // Average price
        timestamp: current_time,
    });
    
    Ok(())
}