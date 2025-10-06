use anchor_lang::prelude::*;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;
use crate::state::{GlobalState, Market, Event, OrderBook, EventStatus, MarketStatus, MarketPhase, AdminHierarchy};
use crate::events::EventCreated;
use crate::error::ErrorCode;
use crate::utils::normalize_opta_odds;

#[derive(Accounts)]
#[instruction(event_id: String, question: String, max_shares: u32, opta_odds_yes: u16, match_timestamp: i64)]
pub struct CreateEvent<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        seeds = [b"admin_hierarchy"],
        bump,
        constraint = admin_hierarchy.is_super_admin(&admin.key()) @ ErrorCode::SuperAdminRequired
    )]
    pub admin_hierarchy: Account<'info, AdminHierarchy>,
    
    #[account(
        mut,
        seeds = [b"market", market.market_id.as_bytes()],
        bump
        // Removed constraint: Allow any admin to create events for any market
        // Admin validation is already handled by admin_hierarchy check above
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = admin,
        space = 8 + Event::INIT_SPACE,
        seeds = [b"event", market.market_id.as_bytes(), event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    

    #[account(
        init,
        payer = admin,
        space = 8 + OrderBook::INIT_SPACE,
        seeds = [b"orderbook", event_id.as_bytes(), b"primary"],
        bump
    )]
    pub order_book: Account<'info, OrderBook>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateEvent>,
    event_id: String,
    question: String,
    max_shares: u32,
    opta_odds_yes: u16,
    match_timestamp: i64,
) -> Result<()> {
    require!(event_id.len() <= 50, ErrorCode::EventIdTooLong);
    require!(question.len() <= 200, ErrorCode::QuestionTooLong);
    require!(!event_id.is_empty() && !question.is_empty(), ErrorCode::InvalidInput);
    require!(max_shares > 0 && max_shares <= 1000, ErrorCode::InvalidShareCount);
    require!(max_shares % 2 == 0, ErrorCode::ShareCountMustBeEven);
    require!(opta_odds_yes > 0 && opta_odds_yes < 10000, ErrorCode::InvalidOdds);
    
    let current_time = Clock::get()?.unix_timestamp;
    require!(match_timestamp > current_time + 3600, ErrorCode::MatchTooSoon);
    
    let global_state = &ctx.accounts.global_state;
    require!(!global_state.is_paused, ErrorCode::SystemPaused);
    
    // Validate super admin
    crate::utils::validate_super_admin(&ctx.accounts.admin_hierarchy, &ctx.accounts.admin.key())?;

    let market = &mut ctx.accounts.market;
    // Removed constraint: Any admin can create events for any market
    // require!(market.admin == ctx.accounts.admin.key(), ErrorCode::Unauthorized);
    require!(market.status == MarketStatus::Created, ErrorCode::InvalidMarketStatus);
    
    // Calculate share prices from OPTA odds
    let normalized_odds = normalize_opta_odds(opta_odds_yes);
    let yes_price_lamports = (normalized_odds.0 as u64 * LAMPORTS_PER_SOL) / 10000;
    let no_price_lamports = (normalized_odds.1 as u64 * LAMPORTS_PER_SOL) / 10000;
    
    let event = &mut ctx.accounts.event;
    event.event_id = event_id.clone();
    event.market_id = market.market_id.clone();
    event.question = question.clone();
    event.max_shares_total = max_shares;
    event.max_shares_yes = max_shares / 2;
    event.max_shares_no = max_shares / 2;
    event.minted_shares_yes = 0;
    event.minted_shares_no = 0;
    event.yes_share_price = yes_price_lamports;
    event.no_share_price = no_price_lamports;
    event.created_at = current_time;
    event.primary_market_close = match_timestamp - 300;
    event.secondary_market_open = match_timestamp;
    event.secondary_market_close = match_timestamp + 6300;
    event.resolution_timestamp = 0;
    event.admin = ctx.accounts.admin.key();
    event.status = EventStatus::Created;
    event.payout_pool = 0;
    event.winning_outcome = None;
    event.opta_probability_yes = normalized_odds.0;
    event.opta_probability_no = normalized_odds.1;
    event.shares_minted_yes = 0;
    event.shares_minted_no = 0;
    event.remaining_shares = max_shares as u64;
    event.total_matches = 0;
    event.event_start_time = match_timestamp;
    event.primary_market_closed_at = None;
    event.total_platform_fees = 0;
    event.bump = ctx.bumps.event;
    
    let order_book = &mut ctx.accounts.order_book;
    order_book.event_id = event_id.clone();
    order_book.market_phase = MarketPhase::Primary;
    order_book.yes_orders = Vec::new();
    order_book.no_orders = Vec::new();
    order_book.best_yes_bid = 0;
    order_book.best_no_bid = 0;
    order_book.total_yes_volume = 0;
    order_book.total_no_volume = 0;
    order_book.last_price_update = current_time;
    order_book.bump = ctx.bumps.order_book;
    let global_state = &mut ctx.accounts.global_state;
    global_state.total_events = global_state.total_events.checked_add(1).unwrap();
    
    market.total_events = market.total_events.checked_add(1).unwrap();
    
    emit!(EventCreated {
        event_id,
        market_id: market.market_id.clone(),
        question,
        shares_yes: event.max_shares_yes,
        shares_no: event.max_shares_no,
        yes_share_price: event.yes_share_price,
        no_share_price: event.no_share_price,
        primary_market_close: event.primary_market_close,
        secondary_market_open: event.secondary_market_open,
        secondary_market_close: event.secondary_market_close,
        admin: event.admin,
        timestamp: current_time,
        opta_probability_yes: event.opta_probability_yes,
        opta_probability_no: event.opta_probability_no,
    });
    
    Ok(())
}