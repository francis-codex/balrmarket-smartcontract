use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{GlobalState, Event, Order, EscrowAccount, OrderType, OrderStatus, MatchedPair};
use crate::events::{OrderMatched, MatchProcessed};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String, yes_order_id: u64, no_order_id: u64)]
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
        bump,
        constraint = event.remaining_shares > 0 @ ErrorCode::InsufficientShares
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), yes_order_id.to_le_bytes().as_ref()],
        bump,
        constraint = yes_order.status == OrderStatus::Pending @ ErrorCode::OrderAlreadyMatched,
        constraint = yes_order.order_type == OrderType::Yes @ ErrorCode::InvalidOrderPrice
    )]
    pub yes_order: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"order", event_id.as_bytes(), no_order_id.to_le_bytes().as_ref()],
        bump,
        constraint = no_order.status == OrderStatus::Pending @ ErrorCode::OrderAlreadyMatched,
        constraint = no_order.order_type == OrderType::No @ ErrorCode::InvalidOrderPrice,
        constraint = yes_order.buyer != no_order.buyer @ ErrorCode::CannotTradeWithSelf
    )]
    pub no_order: Account<'info, Order>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), yes_order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub yes_escrow: Account<'info, EscrowAccount>,
    
    #[account(
        mut,
        seeds = [b"escrow", event_id.as_bytes(), no_order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub no_escrow: Account<'info, EscrowAccount>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + MatchedPair::INIT_SPACE,
        seeds = [b"match", event_id.as_bytes(), event.total_matches.to_le_bytes().as_ref()],
        bump
    )]
    pub matched_pair: Account<'info, MatchedPair>,
    
    #[account(mut)]
    pub yes_buyer: SystemAccount<'info>,
    
    #[account(mut)]
    pub no_buyer: SystemAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MatchOrders>,
    event_id: String,
    yes_order_id: u64,
    no_order_id: u64,
) -> Result<()> {
    let yes_order = &mut ctx.accounts.yes_order;
    let no_order = &mut ctx.accounts.no_order;
    let event = &mut ctx.accounts.event;

    // Validate price compatibility (must sum to 1 SOL within tolerance)
    let one_sol = 1_000_000_000u64; // 1 SOL in lamports
    let combined_price = yes_order.unit_price
        .checked_add(no_order.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Allow 1% tolerance for price matching
    let tolerance = one_sol / 100;
    require!(
        combined_price >= one_sol.saturating_sub(tolerance) && 
        combined_price <= one_sol + tolerance,
        ErrorCode::InvalidPriceSum
    );
    
    // FIFO logic: Check that these are the earliest available orders
    // In a full implementation, you'd query all pending orders and sort by created_at
    // For now, we assume the caller provides the correct earliest orders
    
    // Determine match quantity (minimum of both orders)
    let match_quantity = std::cmp::min(yes_order.quantity, no_order.quantity);
    require!(match_quantity > 0, ErrorCode::InvalidOrderQuantity);
    
    // Check remaining shares in event
    require!(match_quantity <= event.remaining_shares, ErrorCode::InsufficientShares);
    
    // Calculate amounts for settlement
    let yes_amount = match_quantity
        .checked_mul(yes_order.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let no_amount = match_quantity
        .checked_mul(no_order.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // SECURITY FIX: Use secure CPI for escrow settlement
    // YES buyer receives NO buyer's escrowed amount
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.no_escrow.to_account_info(),
                to: ctx.accounts.yes_buyer.to_account_info(),
            },
        ),
        no_amount,
    )?;
    
    // NO buyer receives YES buyer's escrowed amount
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.yes_escrow.to_account_info(),
                to: ctx.accounts.no_buyer.to_account_info(),
            },
        ),
        yes_amount,
    )?;
    
    // Update order quantities
    yes_order.quantity = yes_order.quantity
        .checked_sub(match_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    no_order.quantity = no_order.quantity
        .checked_sub(match_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Update order total amounts
    yes_order.total_amount = yes_order.quantity
        .checked_mul(yes_order.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    no_order.total_amount = no_order.quantity
        .checked_mul(no_order.unit_price)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Update escrow amounts
    ctx.accounts.yes_escrow.amount = yes_order.total_amount;
    ctx.accounts.no_escrow.amount = no_order.total_amount;
    
    // Mark orders as matched if fully filled
    if yes_order.quantity == 0 {
        yes_order.status = OrderStatus::Matched;
    }
    if no_order.quantity == 0 {
        no_order.status = OrderStatus::Matched;
    }
    
    // Update event counters
    event.shares_minted_yes = event.shares_minted_yes
        .checked_add(match_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    event.shares_minted_no = event.shares_minted_no
        .checked_add(match_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    event.remaining_shares = event.remaining_shares
        .checked_sub(match_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    event.total_matches = event.total_matches
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    let current_time = Clock::get()?.unix_timestamp;
    
    // Initialize matched pair record
    let matched_pair = &mut ctx.accounts.matched_pair;
    matched_pair.event_id = event_id.clone();
    matched_pair.yes_order_id = yes_order_id;
    matched_pair.no_order_id = no_order_id;
    matched_pair.yes_buyer = yes_order.buyer;
    matched_pair.no_buyer = no_order.buyer;
    matched_pair.quantity = match_quantity;
    matched_pair.yes_price = yes_order.unit_price;
    matched_pair.no_price = no_order.unit_price;
    matched_pair.matched_at = current_time;
    matched_pair.bump = ctx.bumps.matched_pair;
    
    // Emit events
    emit!(OrderMatched {
        order_id_1: yes_order_id,
        order_id_2: no_order_id,
        event_id: event_id.clone(),
        buyer_1: yes_order.buyer,
        buyer_2: no_order.buyer,
        quantity: match_quantity,
        unit_price: (yes_order.unit_price + no_order.unit_price) / 2,
        timestamp: current_time,
    });
    
    emit!(MatchProcessed {
        event_id,
        matched_pair_id: event.total_matches - 1,
        yes_order_id,
        no_order_id,
        quantity: match_quantity,
        yes_price: yes_order.unit_price,
        no_price: no_order.unit_price,
        timestamp: current_time,
    });
    
    Ok(())
}