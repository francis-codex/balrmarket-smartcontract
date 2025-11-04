use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use crate::state::{
    GlobalState, Event, EventStatus, SecondaryMarketState, SecondaryMarketStatus,
    SecondaryOrder, SecondaryOrderStatus, SecondaryBid, SecondaryBidStatus,
    ShareToken, ShareLock, LockStatus, ShareType, BidFinalizationData,
    NonceRegistry, LAMPORTS_PER_SOL, MAX_BIDS_PER_FINALIZATION
};
use crate::events::{SecondaryBidPlaced, SecondaryBidAccepted, SecondaryTradeSettled, SecondaryOrderFinalized};
use crate::error::ErrorCode;
use crate::utils::signature::{create_bid_message, verify_bid_signature, validate_signature_timestamp};

/// V2: Consolidated instruction for finalizing secondary market orders with multiple bids
///
/// This instruction consolidates three operations into one transaction:
/// 1. Create bid records (retroactive, from off-chain signed bids)
/// 2. Accept bids
/// 3. Transfer shares and SOL
///
/// Benefits:
/// - Gas savings: ~75% fewer transactions
/// - Atomic execution: All bids succeed or fail together
/// - Backend control: Admin verifies bids off-chain before finalization
///
/// Security:
/// - Ed25519 signature verification for each bid
/// - Nonce-based replay protection
/// - Timestamp validation
/// - Self-trading prevention
///
/// Limitations:
/// - Max 10 bids per transaction (compute unit limit)
/// - Requires pre-created bid PDA accounts
/// - Backend must construct Ed25519 instruction

#[derive(Accounts)]
#[instruction(event_id: String, order_id: u64)]
pub struct FinalizeSecondaryOrder<'info> {
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
        seeds = [
            b"share_lock",
            seller_share_token.key().as_ref(),
            order_id.to_le_bytes().as_ref()
        ],
        bump,
        constraint = share_lock.order_id == order_id @ ErrorCode::InvalidInput,
        constraint = share_lock.status == LockStatus::Locked @ ErrorCode::ShareNotLocked
    )]
    pub share_lock: Account<'info, ShareLock>,

    #[account(
        mut,
        constraint = seller_share_token.owner == seller.key() @ ErrorCode::Unauthorized,
        constraint = seller_share_token.event_id == event_id @ ErrorCode::InvalidInput,
        constraint = seller_share_token.is_locked @ ErrorCode::ShareNotLocked
    )]
    pub seller_share_token: Account<'info, ShareToken>,

    #[account(
        mut,
        seeds = [b"nonce_registry", event_id.as_bytes(), order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub nonce_registry: Account<'info, NonceRegistry>,

    /// Seller receives SOL (minus platform fees)
    /// CHECK: This is the seller's SOL account (validated by seller signer)
    #[account(mut)]
    pub seller: Signer<'info>,

    /// Fee recipient receives platform fees
    /// CHECK: Validated against global_state.fee_recipient
    #[account(
        mut,
        constraint = fee_recipient.key() == global_state.fee_recipient @ ErrorCode::Unauthorized
    )]
    pub fee_recipient: UncheckedAccount<'info>,

    /// Backend authority (admin) that triggers finalization
    #[account(
        mut,
        constraint = authority.key() == global_state.admin @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Instructions sysvar for signature verification
    /// CHECK: This is the Solana instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub ix_sysvar: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    // remaining_accounts:
    // For each bid [i]:
    //   [i * 3 + 0]: buyer_bid_pda (mut, Account<SecondaryBid> - must be pre-created by backend)
    //   [i * 3 + 1]: buyer_sol_account (mut, SystemAccount - pays for shares)
    //   [i * 3 + 2]: buyer_share_token (mut, Account<ShareToken> - receives shares, init_if_needed)
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, FinalizeSecondaryOrder<'info>>,
    event_id: String,
    order_id: u64,
    bids: Vec<BidFinalizationData>,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;

    // ═══════════════════════════════════════════════════════════
    //  PHASE 1: VALIDATIONS
    // ═══════════════════════════════════════════════════════════

    msg!("Starting finalization for order {} with {} bids", order_id, bids.len());

    // Validate bid count
    require!(
        !bids.is_empty() && bids.len() <= MAX_BIDS_PER_FINALIZATION,
        ErrorCode::InvalidBatchSize
    );

    // Validate order is active
    require!(
        ctx.accounts.secondary_order.status == SecondaryOrderStatus::Active ||
        ctx.accounts.secondary_order.status == SecondaryOrderStatus::PartiallyFilled,
        ErrorCode::OrderNotActive
    );

    // Validate order hasn't expired
    require!(
        current_time <= ctx.accounts.secondary_order.expires_at,
        ErrorCode::OrderExpired
    );

    // Validate remaining_accounts count (3 accounts per bid)
    require!(
        ctx.remaining_accounts.len() >= bids.len() * 3,
        ErrorCode::InsufficientAccounts
    );

    // Calculate total quantity across all bids
    let mut total_quantity: u64 = 0;
    for bid in bids.iter() {
        total_quantity = total_quantity
            .checked_add(bid.quantity)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }

    // Validate total doesn't exceed remaining order quantity
    require!(
        total_quantity <= ctx.accounts.secondary_order.remaining_quantity,
        ErrorCode::InsufficientQuantity
    );

    // Initialize nonce registry if needed (check if order_id is set)
    if ctx.accounts.nonce_registry.order_id == 0 {
        ctx.accounts.nonce_registry.order_id = order_id;
        ctx.accounts.nonce_registry.event_id = event_id.clone();
        ctx.accounts.nonce_registry.used_nonces = Vec::new();
        ctx.accounts.nonce_registry.bump = ctx.bumps.nonce_registry;
        msg!("Initialized nonce registry for order {}", order_id);
    }

    // ═══════════════════════════════════════════════════════════
    //  PHASE 2: PROCESS EACH BID
    // ═══════════════════════════════════════════════════════════

    let platform_fee_bps = ctx.accounts.global_state.platform_fee_secondary;
    let mut total_seller_receives: u64 = 0;
    let mut total_platform_fees: u64 = 0;

    for (idx, bid) in bids.iter().enumerate() {
        let account_offset = idx * 3;

        msg!("Processing bid {}/{}: bid_id={}, quantity={}", idx + 1, bids.len(), bid.bid_id, bid.quantity);

        // Get accounts for this bid from remaining_accounts
        let buyer_bid_account = &ctx.remaining_accounts[account_offset];
        let buyer_sol_account = &ctx.remaining_accounts[account_offset + 1];
        let buyer_share_token_account = &ctx.remaining_accounts[account_offset + 2];

        // ─────────────────────────────────────────────────────────
        // VALIDATION: Individual Bid
        // ─────────────────────────────────────────────────────────

        // Validate bid quantity
        require!(
            bid.quantity > 0 && bid.quantity <= ctx.accounts.secondary_order.remaining_quantity,
            ErrorCode::InvalidBidQuantity
        );

        // Validate price
        require!(
            bid.price_per_share > 0 && bid.price_per_share < LAMPORTS_PER_SOL,
            ErrorCode::InvalidSecondaryPrice
        );

        // Prevent self-trading
        require!(
            bid.buyer != ctx.accounts.seller.key(),
            ErrorCode::CannotTradeWithSelf
        );

        // Validate timestamp (must be within last hour)
        validate_signature_timestamp(bid.timestamp, current_time, 3600)?;

        // Validate nonce hasn't been used
        require!(
            !ctx.accounts.nonce_registry.is_nonce_used(bid.nonce),
            ErrorCode::NonceAlreadyUsed
        );

        // Validate buyer SOL account matches bid data
        require!(
            bid.buyer == *buyer_sol_account.key,
            ErrorCode::BuyerAccountMismatch
        );

        // ─────────────────────────────────────────────────────────
        // SECURITY: VERIFY SIGNATURE
        // ─────────────────────────────────────────────────────────

        let message = create_bid_message(
            &crate::ID,
            order_id,
            bid.bid_id,
            &event_id,
            bid.quantity,
            bid.price_per_share,
            bid.nonce,
            bid.timestamp,
        );

        // Verify signature using Ed25519 program (instruction must be at index 0)
        verify_bid_signature(
            &bid.buyer_signature,
            &bid.buyer,
            &message,
            &ctx.accounts.ix_sysvar,
            0, // Ed25519 instruction should be first in the transaction
        )?;

        msg!("Signature verified for bid_id={}", bid.bid_id);

        // ─────────────────────────────────────────────────────────
        // CALCULATE AMOUNTS
        // ─────────────────────────────────────────────────────────

        let total_amount = bid.quantity
            .checked_mul(bid.price_per_share)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let platform_fee = (total_amount as u128)
            .checked_mul(platform_fee_bps as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::ArithmeticOverflow)? as u64;

        let seller_receives = total_amount
            .checked_sub(platform_fee)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        total_seller_receives = total_seller_receives
            .checked_add(seller_receives)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        total_platform_fees = total_platform_fees
            .checked_add(platform_fee)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // ─────────────────────────────────────────────────────────
        // EFFECTS: CREATE/UPDATE BID RECORD
        // ─────────────────────────────────────────────────────────

        // Deserialize bid account (should be pre-created but empty)
        let mut bid_account_data = buyer_bid_account.try_borrow_mut_data()?;

        // Create SecondaryBid struct
        let secondary_bid = SecondaryBid {
            bid_id: bid.bid_id,
            order_id,
            event_id: event_id.clone(),
            buyer: bid.buyer,
            bid_price: bid.price_per_share,
            quantity: bid.quantity,
            status: SecondaryBidStatus::Accepted,
            created_at: bid.timestamp,
            expires_at: current_time, // Already accepted, set to current
            accepted_at: Some(current_time),
            buyer_signature: bid.buyer_signature,
            nonce: bid.nonce,
            finalized_at: Some(current_time),
            bump: 0, // Bump stored in account derivation
        };

        // Serialize bid data
        secondary_bid.try_serialize(&mut &mut bid_account_data[..])?;
        drop(bid_account_data); // Release borrow

        // ─────────────────────────────────────────────────────────
        // INTERACTIONS: TRANSFER SOL
        // ─────────────────────────────────────────────────────────

        // Transfer SOL to seller (amount minus platform fee)
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: buyer_sol_account.clone(),
                    to: ctx.accounts.seller.to_account_info(),
                },
            ),
            seller_receives,
        )?;

        // Transfer platform fee to fee recipient
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: buyer_sol_account.clone(),
                    to: ctx.accounts.fee_recipient.to_account_info(),
                },
            ),
            platform_fee,
        )?;

        msg!("Transferred {} lamports to seller, {} lamports fee", seller_receives, platform_fee);

        // ─────────────────────────────────────────────────────────
        // INTERACTIONS: TRANSFER SHARES
        // ─────────────────────────────────────────────────────────

        // Deduct shares from seller
        ctx.accounts.seller_share_token.quantity = ctx.accounts.seller_share_token.quantity
            .checked_sub(bid.quantity)
            .ok_or(ErrorCode::InsufficientShares)?;

        // Load or create buyer's share token
        let mut buyer_share_data = buyer_share_token_account.try_borrow_mut_data()?;

        // Check if buyer share token is initialized (discriminator check)
        let is_initialized = buyer_share_data.len() >= 8 &&
            buyer_share_data[0..8] != [0u8; 8];

        if is_initialized {
            // Deserialize existing share token
            let mut buyer_share_token = ShareToken::try_deserialize(&mut &buyer_share_data[..])?;

            // Validate it matches expected configuration
            require!(
                buyer_share_token.event_id == event_id,
                ErrorCode::InvalidInput
            );
            require!(
                buyer_share_token.share_type == ctx.accounts.seller_share_token.share_type,
                ErrorCode::InvalidShareType
            );
            require!(
                buyer_share_token.owner == bid.buyer,
                ErrorCode::ShareNotOwned
            );

            // Add to existing quantity
            buyer_share_token.quantity = buyer_share_token.quantity
                .checked_add(bid.quantity)
                .ok_or(ErrorCode::ArithmeticOverflow)?;

            // Serialize back
            buyer_share_token.try_serialize(&mut &mut buyer_share_data[..])?;
        } else {
            // Create new share token for buyer
            let buyer_share_token = ShareToken {
                event_id: event_id.clone(),
                owner: bid.buyer,
                share_type: ctx.accounts.seller_share_token.share_type.clone(),
                quantity: bid.quantity,
                mint_authority: ctx.accounts.seller_share_token.mint_authority,
                created_at: current_time,
                is_locked: false,
                lock_order_id: None,
                locked_at: None,
                bump: 0,
            };

            // Serialize new share token
            buyer_share_token.try_serialize(&mut &mut buyer_share_data[..])?;
        }

        drop(buyer_share_data); // Release borrow

        msg!("Transferred {} shares to buyer", bid.quantity);

        // ─────────────────────────────────────────────────────────
        // MARK NONCE AS USED
        // ─────────────────────────────────────────────────────────

        ctx.accounts.nonce_registry.mark_nonce_used(bid.nonce);

        // ─────────────────────────────────────────────────────────
        // EMIT EVENTS (per-bid granular events)
        // ─────────────────────────────────────────────────────────

        // Emit bid placed event (retroactive)
        emit!(SecondaryBidPlaced {
            event_id: event_id.clone(),
            order_id,
            bid_id: bid.bid_id,
            buyer: bid.buyer,
            bid_price: bid.price_per_share,
            quantity: bid.quantity,
            timestamp: bid.timestamp,
        });

        // Emit bid accepted event
        emit!(SecondaryBidAccepted {
            event_id: event_id.clone(),
            order_id,
            bid_id: bid.bid_id,
            seller: ctx.accounts.seller.key(),
            buyer: bid.buyer,
            timestamp: current_time,
        });

        // Emit trade settled event
        let share_type_str = match ctx.accounts.seller_share_token.share_type {
            ShareType::Yes => "YES",
            ShareType::No => "NO",
        };

        emit!(SecondaryTradeSettled {
            event_id: event_id.clone(),
            trade_id: bid.bid_id,
            seller: ctx.accounts.seller.key(),
            buyer: bid.buyer,
            share_type: share_type_str.to_string(),
            quantity: bid.quantity,
            price_per_share: bid.price_per_share,
            total_amount,
            platform_fee,
            timestamp: current_time,
        });

        // Update order remaining quantity after each bid
        ctx.accounts.secondary_order.remaining_quantity = ctx.accounts.secondary_order.remaining_quantity
            .checked_sub(bid.quantity)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }

    // ═══════════════════════════════════════════════════════════
    //  PHASE 3: UPDATE ORDER STATE
    // ═══════════════════════════════════════════════════════════

    // Update finalization counters
    ctx.accounts.secondary_order.finalized_bid_count = ctx.accounts.secondary_order.finalized_bid_count
        .checked_add(bids.len() as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    ctx.accounts.secondary_order.total_finalized_quantity = ctx.accounts.secondary_order.total_finalized_quantity
        .checked_add(total_quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Update order status and release lock if fully filled
    let order_status_str = if ctx.accounts.secondary_order.remaining_quantity == 0 {
        ctx.accounts.secondary_order.status = SecondaryOrderStatus::Filled;

        // Release share lock
        ctx.accounts.share_lock.status = LockStatus::Released;
        ctx.accounts.seller_share_token.is_locked = false;
        ctx.accounts.seller_share_token.lock_order_id = None;
        ctx.accounts.seller_share_token.locked_at = None;

        "Filled"
    } else {
        ctx.accounts.secondary_order.status = SecondaryOrderStatus::PartiallyFilled;
        "PartiallyFilled"
    };

    // ═══════════════════════════════════════════════════════════
    //  PHASE 4: UPDATE MARKET STATS & EMIT SUMMARY EVENT
    // ═══════════════════════════════════════════════════════════

    ctx.accounts.secondary_market_state.total_trades_settled = ctx.accounts.secondary_market_state
        .total_trades_settled
        .checked_add(bids.len() as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    ctx.accounts.event.total_secondary_trades = ctx.accounts.event
        .total_secondary_trades
        .checked_add(bids.len() as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Emit summary event for the entire finalization
    emit!(SecondaryOrderFinalized {
        event_id,
        order_id,
        seller: ctx.accounts.seller.key(),
        bid_count: bids.len() as u64,
        total_quantity,
        total_seller_receives,
        total_platform_fees,
        order_status: order_status_str.to_string(),
        remaining_quantity: ctx.accounts.secondary_order.remaining_quantity,
        timestamp: current_time,
    });

    msg!(
        "Finalization complete: {} bids, {} shares transferred, {} SOL to seller, {} SOL fees",
        bids.len(),
        total_quantity,
        total_seller_receives,
        total_platform_fees
    );

    Ok(())
}
