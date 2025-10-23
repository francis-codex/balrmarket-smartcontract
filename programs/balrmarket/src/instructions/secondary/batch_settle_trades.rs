use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    SecondaryOrder, SecondaryBid, SecondaryBidStatus, ShareToken, ShareLock, LockStatus,
    SettledTrade, ShareType, TradeData, MAX_BATCH_TRADES
};
use crate::events::SecondaryTradeSettled;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct BatchSettleTrades<'info> {
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

    /// Settlement authority (backend)
    #[account(mut)]
    pub settlement_authority: Signer<'info>,

    /// Fee recipient for platform fees
    #[account(
        mut,
        constraint = fee_recipient.key() == global_state.fee_recipient @ ErrorCode::Unauthorized
    )]
    pub fee_recipient: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<BatchSettleTrades>,
    event_id: String,
    trades: Vec<TradeData>,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let global_state = &ctx.accounts.global_state;

    //  VALIDATIONS 

    // Validate batch size
    require!(
        trades.len() > 0 && trades.len() <= MAX_BATCH_TRADES,
        ErrorCode::InvalidInput
    );

    // Get platform fee for secondary market
    let platform_fee_bps = global_state.platform_fee_secondary;

    //  PROCESS EACH TRADE 
    // Note: In a production system, this would use remaining_accounts to handle
    // variable number of accounts. For this implementation, we demonstrate the
    // logic for a single trade and note where batch processing would occur.

    for (trade_idx, trade) in trades.iter().enumerate() {
        // SECURITY: Verify signatures
        // In production, you would verify Ed25519 signatures here
        // require!(
        //     verify_signature(&trade.seller_signature, trade.seller, trade_data),
        //     ErrorCode::InvalidSignature
        // );
        // require!(
        //     verify_signature(&trade.buyer_signature, trade.buyer, trade_data),
        //     ErrorCode::InvalidSignature
        // );

        // Validate trade data
        require!(
            trade.quantity > 0,
            ErrorCode::InvalidOrderQuantity
        );

        require!(
            trade.price_per_share > 0 && trade.price_per_share < crate::state::LAMPORTS_PER_SOL,
            ErrorCode::InvalidSecondaryPrice
        );

        // Calculate amounts
        let total_amount = trade.quantity
            .checked_mul(trade.price_per_share)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let platform_fee = (total_amount as u128)
            .checked_mul(platform_fee_bps as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::ArithmeticOverflow)? as u64;

        let _seller_receives = total_amount
            .checked_sub(platform_fee)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // SECURITY: Checks-Effects-Interactions (CEI) pattern
        // 1. CHECKS - All validations done above
        // 2. EFFECTS - Update state (would be done with remaining_accounts)
        // 3. INTERACTIONS - Transfer SOL and shares

        // In production with remaining_accounts, you would:
        // - Load seller_sol_account from remaining_accounts[idx * N + 0]
        // - Load buyer_sol_account from remaining_accounts[idx * N + 1]
        // - Load seller_share_token from remaining_accounts[idx * N + 2]
        // - Load buyer_share_token from remaining_accounts[idx * N + 3]
        // - Load secondary_order from remaining_accounts[idx * N + 4]
        // - Load secondary_bid from remaining_accounts[idx * N + 5]
        // - Load share_lock from remaining_accounts[idx * N + 6]
        // - Load settled_trade (new PDA) from remaining_accounts[idx * N + 7]

        // Transfer SOL to seller (total - fee)
        // system_program::transfer(
        //     CpiContext::new(
        //         ctx.accounts.system_program.to_account_info(),
        //         Transfer {
        //             from: buyer_sol_account.to_account_info(),
        //             to: seller_sol_account.to_account_info(),
        //         },
        //     ),
        //     seller_receives,
        // )?;

        // Transfer platform fee
        // system_program::transfer(
        //     CpiContext::new(
        //         ctx.accounts.system_program.to_account_info(),
        //         Transfer {
        //             from: buyer_sol_account.to_account_info(),
        //             to: ctx.accounts.fee_recipient.to_account_info(),
        //         },
        //     ),
        //     platform_fee,
        // )?;

        // Update share ownership (would happen in production)
        // seller_share_token.quantity -= trade.quantity;
        // seller_share_token.is_locked = false;
        // seller_share_token.lock_order_id = None;
        // seller_share_token.locked_at = None;

        // buyer_share_token.quantity += trade.quantity;
        // buyer_share_token.owner = trade.buyer;

        // Update bid and order status
        // secondary_bid.status = SecondaryBidStatus::Settled;
        // share_lock.status = LockStatus::Released;

        // Create settled trade record (would be init in production)
        // settled_trade.trade_id = calculate_trade_id();
        // settled_trade.event_id = event_id.clone();
        // settled_trade.seller = trade.seller;
        // settled_trade.buyer = trade.buyer;
        // settled_trade.share_type = trade.share_type;
        // settled_trade.quantity = trade.quantity;
        // settled_trade.price_per_share = trade.price_per_share;
        // settled_trade.total_amount = total_amount;
        // settled_trade.platform_fee = platform_fee;
        // settled_trade.seller_receives = seller_receives;
        // settled_trade.settled_at = current_time;

        // Emit event for this trade
        let share_type_str = match trade.share_type {
            ShareType::Yes => "YES",
            ShareType::No => "NO",
        };

        emit!(SecondaryTradeSettled {
            event_id: event_id.clone(),
            trade_id: trade_idx as u64, // Would be proper trade_id in production
            seller: trade.seller,
            buyer: trade.buyer,
            share_type: share_type_str.to_string(),
            quantity: trade.quantity,
            price_per_share: trade.price_per_share,
            total_amount,
            platform_fee,
            timestamp: current_time,
        });
    }

    // Update secondary market state
    let secondary_market_state = &mut ctx.accounts.secondary_market_state;
    secondary_market_state.total_trades_settled = secondary_market_state
        .total_trades_settled
        .checked_add(trades.len() as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Update event totals
    let event = &mut ctx.accounts.event;
    event.total_secondary_trades = event
        .total_secondary_trades
        .checked_add(trades.len() as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    Ok(())
}

// NOTE: This implementation demonstrates the settlement logic but is simplified.
// A production implementation would use remaining_accounts to handle variable
// numbers of trades with all necessary account validations and transfers.
//
// Each trade would require these accounts in remaining_accounts:
// [
//     seller_sol_account (mut, SystemAccount),
//     buyer_sol_account (mut, SystemAccount),
//     seller_share_token (mut, Account<ShareToken>),
//     buyer_share_token (mut or init, Account<ShareToken>),
//     secondary_order (mut, Account<SecondaryOrder>),
//     secondary_bid (mut, Account<SecondaryBid>),
//     share_lock (mut, Account<ShareLock>),
//     settled_trade (init, Account<SettledTrade>),
// ]
// Total: 8 accounts per trade × up to 100 trades = 800 accounts max
