#![allow(unexpected_cfgs)]
#[warn(unused_imports)]
#[warn(deprecated)]

pub mod instructions;
pub mod state;
pub mod events;
pub mod error;
pub mod utils;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
pub use events::*;
pub use utils::*;

declare_id!("CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq");

#[program]
pub mod balrmarket {
    use super::*;

    /// Initialize the global state for the platform
    pub fn initialize_global_state(
        ctx: Context<InitializeGlobalState>,
        admin: Pubkey,
        platform_fee_primary: u16,
        platform_fee_secondary: u16,
    ) -> Result<()> {
        instructions::initialize_global_state::handler(
            ctx,
            admin,
            platform_fee_primary,
            platform_fee_secondary,
        )
    }

    /// Create a new market for a football match
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: String,
        team_a: String,
        team_b: String,
        match_timestamp: i64,
    ) -> Result<()> {
        instructions::create_market::handler(
            ctx,
            market_id,
            team_a,
            team_b,
            match_timestamp,
        )
    }

    /// Create a new prediction event within a market
    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: String,
        question: String,
        max_shares: u32,
        opta_odds_yes: u32,
        match_timestamp: i64,
    ) -> Result<()> {
        instructions::create_event::handler(
            ctx,
            event_id,
            question,
            max_shares,
            opta_odds_yes,
            match_timestamp,
        )
    }

    /// Place a new order with SOL escrow (primary market - uses event's fixed prices)
    pub fn place_order(
        ctx: Context<PlaceOrder>,
        order_id: u64,
        event_id: String,
        order_type: OrderType,
        quantity: u64,
    ) -> Result<()> {
        instructions::place_order::handler(
            ctx,
            order_id,
            event_id,
            order_type,
            quantity,
        )
    }

    /// Cancel a pending order and refund SOL
    pub fn cancel_order(
        ctx: Context<CancelOrder>,
        order_id: u64,
        event_id: String,
    ) -> Result<()> {
        instructions::cancel_order::handler(
            ctx,
            order_id,
            event_id,
        )
    }

    /// Match compatible orders automatically
    pub fn match_orders(
        ctx: Context<MatchOrders>,
        event_id: String,
        yes_order_id: u64,
        no_order_id: u64,
    ) -> Result<()> {
        instructions::match_orders::handler(
            ctx,
            event_id,
            yes_order_id,
            no_order_id,
        )
    }

    /// Mint share tokens for matched buyers
    pub fn mint_shares(
        ctx: Context<MintShares>,
        event_id: String,
        matched_pair_id: u64,
    ) -> Result<()> {
        instructions::mint_shares::handler(
            ctx,
            event_id,
            matched_pair_id,
        )
    }

    /// Process match for post-match accounting
    pub fn process_match(
        ctx: Context<ProcessMatch>,
        event_id: String,
        matched_pair_id: u64,
    ) -> Result<()> {
        instructions::process_match::handler(
            ctx,
            event_id,
            matched_pair_id,
        )
    }

    /// End primary market when event starts
    pub fn end_primary_market(
        ctx: Context<EndPrimaryMarket>,
        event_id: String,
    ) -> Result<()> {
        instructions::end_primary_market::handler(
            ctx,
            event_id,
        )
    }

    /// Refund unmatched orders after primary market closure
    pub fn refund_unmatched_orders(
        ctx: Context<RefundOrders>,
        event_id: String,
        order_id: u64,
    ) -> Result<()> {
        instructions::refund_orders::handler(
            ctx,
            event_id,
            order_id,
        )
    }

    /// Collect platform fees accumulated in event
    pub fn collect_platform_fees(
        ctx: Context<CollectFees>,
        event_id: String,
    ) -> Result<()> {
        instructions::collect_fees::handler(
            ctx,
            event_id,
        )
    }

    // NEW ADMIN HIERARCHY FUNCTIONS

    /// Initialize the hierarchical admin system
    pub fn initialize_admin_hierarchy(
        ctx: Context<InitializeAdminHierarchy>,
    ) -> Result<()> {
        instructions::initialize_admin_hierarchy::handler(ctx)
    }

    /// Add a new super admin (super admin only)
    pub fn add_super_admin(
        ctx: Context<AddSuperAdmin>,
        new_super_admin: Pubkey,
    ) -> Result<()> {
        instructions::add_super_admin::handler(ctx, new_super_admin)
    }

    /// Remove a super admin (super admin only)
    pub fn remove_super_admin(
        ctx: Context<RemoveSuperAdmin>,
        admin_to_remove: Pubkey,
    ) -> Result<()> {
        instructions::remove_super_admin::handler(ctx, admin_to_remove)
    }

    /// Close admin hierarchy account (super admin only) - clears all admins
    pub fn close_admin_hierarchy(
        ctx: Context<CloseAdminHierarchy>,
    ) -> Result<()> {
        instructions::close_admin_hierarchy::handler(ctx)
    }

    /// Get admin information (view function)
    pub fn get_admin_info(
        ctx: Context<GetAdminInfo>,
    ) -> Result<AdminInfoResponse> {
        instructions::get_admin_info::handler(ctx)
    }

    //  CRUD FUNCTIONS 

    // ORDER CRUD
    /// Get a single order by event_id and order_id
    pub fn get_order(
        ctx: Context<GetOrder>,
        event_id: String,
        order_id: u64,
    ) -> Result<OrderResponse> {
        instructions::crud::order_crud::get_order_handler(ctx, event_id, order_id)
    }

    /// Get all orders for a specific user
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_user_orders(
        ctx: Context<GetUserOrders>,
        user: Pubkey,
        status_filter: Option<OrderStatus>,
        event_filter: Option<String>,
    ) -> Result<Vec<OrderResponse>> {
        instructions::crud::order_crud::get_user_orders_handler(ctx, user, status_filter, event_filter)
    }

    /// Get all orders for a specific event
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_event_orders(
        ctx: Context<GetEventOrders>,
        event_id: String,
        order_type_filter: Option<OrderType>,
        status_filter: Option<OrderStatus>,
    ) -> Result<Vec<OrderResponse>> {
        instructions::crud::order_crud::get_event_orders_handler(ctx, event_id, order_type_filter, status_filter)
    }

    /// Get all orders (admin only)
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_all_orders(
        ctx: Context<GetAllOrders>,
        status_filter: Option<OrderStatus>,
        order_type_filter: Option<OrderType>,
    ) -> Result<Vec<OrderResponse>> {
        instructions::crud::order_crud::get_all_orders_handler(ctx, status_filter, order_type_filter)
    }

    // EVENT CRUD
    /// Get a single event by market_id and event_id
    pub fn get_event(
        ctx: Context<GetEvent>,
        market_id: String,
        event_id: String,
    ) -> Result<EventResponse> {
        instructions::crud::event_crud::get_event_handler(ctx, market_id, event_id)
    }

    /// Get all events by market
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_events_by_market(
        ctx: Context<GetEventsByMarket>,
        market_id: String,
        status_filter: Option<EventStatus>,
    ) -> Result<Vec<EventResponse>> {
        instructions::crud::event_crud::get_events_by_market_handler(ctx, market_id, status_filter)
    }

    /// Get all events
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_all_events(
        ctx: Context<GetAllEvents>,
        status_filter: Option<EventStatus>,
        admin_filter: Option<Pubkey>,
    ) -> Result<Vec<EventResponse>> {
        instructions::crud::event_crud::get_all_events_handler(ctx, status_filter, admin_filter)
    }

    /// Update event details (admin only)
    pub fn update_event(
        ctx: Context<UpdateEvent>,
        market_id: String,
        event_id: String,
        question: Option<String>,
        status: Option<EventStatus>,
    ) -> Result<()> {
        instructions::crud::event_crud::update_event_handler(ctx, market_id, event_id, question, status)
    }

    /// Resolve event with winning outcome (admin only)
    pub fn resolve_event(
        ctx: Context<ResolveEvent>,
        market_id: String,
        event_id: String,
        winning_outcome: bool,
    ) -> Result<()> {
        instructions::crud::event_crud::resolve_event_handler(ctx, market_id, event_id, winning_outcome)
    }

    /// Cancel event (admin only)
    pub fn cancel_event(
        ctx: Context<CancelEvent>,
        market_id: String,
        event_id: String,
    ) -> Result<()> {
        instructions::crud::event_crud::cancel_event_handler(ctx, market_id, event_id)
    }

    // MATCHED PAIR CRUD
    /// Get a single matched pair by event_id and matched_pair_id
    pub fn get_matched_pair(
        ctx: Context<GetMatchedPair>,
        event_id: String,
        matched_pair_id: u64,
    ) -> Result<MatchedPairResponse> {
        instructions::crud::matched_pair_crud::get_matched_pair_handler(ctx, event_id, matched_pair_id)
    }

    /// Get all matched pairs for a specific event
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_event_matches(
        ctx: Context<GetEventMatches>,
        event_id: String,
    ) -> Result<Vec<MatchedPairResponse>> {
        instructions::crud::matched_pair_crud::get_event_matches_handler(ctx, event_id)
    }

    /// Get all matched pairs for a specific user
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_user_matches(
        ctx: Context<GetUserMatches>,
        user: Pubkey,
        event_filter: Option<String>,
    ) -> Result<Vec<MatchedPairResponse>> {
        instructions::crud::matched_pair_crud::get_user_matches_handler(ctx, user, event_filter)
    }

    /// Get all matched pairs (admin only)
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_all_matches(
        ctx: Context<GetAllMatches>,
        event_filter: Option<String>,
    ) -> Result<Vec<MatchedPairResponse>> {
        instructions::crud::matched_pair_crud::get_all_matches_handler(ctx, event_filter)
    }

    // MARKET CRUD
    /// Get a single market by market_id
    pub fn get_market(
        ctx: Context<GetMarket>,
        market_id: String,
    ) -> Result<MarketResponse> {
        instructions::crud::market_crud::get_market_handler(ctx, market_id)
    }

    /// Get all markets
    /// Note: This should be called via client-side RPC using getProgramAccounts
    pub fn get_all_markets(
        ctx: Context<GetAllMarkets>,
        status_filter: Option<MarketStatus>,
    ) -> Result<Vec<MarketResponse>> {
        instructions::crud::market_crud::get_all_markets_handler(ctx, status_filter)
    }

    /// Update market details (admin only)
    pub fn update_market(
        ctx: Context<UpdateMarket>,
        market_id: String,
        team_a: Option<String>,
        team_b: Option<String>,
        match_timestamp: Option<i64>,
        status: Option<MarketStatus>,
    ) -> Result<()> {
        instructions::crud::market_crud::update_market_handler(ctx, market_id, team_a, team_b, match_timestamp, status)
    }

    /// Deactivate market (admin only)
    pub fn deactivate_market(
        ctx: Context<DeactivateMarket>,
        market_id: String,
    ) -> Result<()> {
        instructions::crud::market_crud::deactivate_market_handler(ctx, market_id)
    }

    //  SECONDARY MARKET FUNCTIONS 

    /// Open secondary market after primary closes
    pub fn open_secondary_market(
        ctx: Context<OpenSecondaryMarket>,
        event_id: String,
    ) -> Result<()> {
        instructions::secondary::open_secondary_market::handler(ctx, event_id)
    }

    /// List shares for sale on secondary market
    pub fn list_share_for_sale(
        ctx: Context<ListShareForSale>,
        order_id: u64,
        event_id: String,
        quantity: u64,
        price_per_share: u64,
    ) -> Result<()> {
        instructions::secondary::list_share_for_sale::handler(
            ctx,
            order_id,
            event_id,
            quantity,
            price_per_share,
        )
    }

    /// Place a bid on a secondary market order
    pub fn place_secondary_bid(
        ctx: Context<PlaceSecondaryBid>,
        bid_id: u64,
        event_id: String,
        order_id: u64,
        bid_price: u64,
        quantity: u64,
    ) -> Result<()> {
        instructions::secondary::place_secondary_bid::handler(
            ctx,
            bid_id,
            event_id,
            order_id,
            bid_price,
            quantity,
        )
    }

    /// Accept a bid on secondary market order
    pub fn accept_secondary_bid(
        ctx: Context<AcceptSecondaryBid>,
        event_id: String,
        order_id: u64,
        bid_id: u64,
    ) -> Result<()> {
        instructions::secondary::accept_secondary_bid::handler(
            ctx,
            event_id,
            order_id,
            bid_id,
        )
    }

    /// V2: Finalize secondary market order with multiple off-chain bids
    /// This consolidates bid creation, acceptance, and settlement into one transaction
    /// Requires Ed25519 signature verification for each bid
    pub fn finalize_secondary_order<'info>(
        ctx: Context<'_, '_, '_, 'info, FinalizeSecondaryOrder<'info>>,
        event_id: String,
        order_id: u64,
        bids: Vec<BidFinalizationData>,
    ) -> Result<()> {
        instructions::secondary::finalize_secondary_order::handler(
            ctx,
            event_id,
            order_id,
            bids,
        )
    }

    /// Batch settle accepted trades (backend authority)
    pub fn batch_settle_trades(
        ctx: Context<BatchSettleTrades>,
        event_id: String,
        trades: Vec<TradeData>,
    ) -> Result<()> {
        instructions::secondary::batch_settle_trades::handler(ctx, event_id, trades)
    }

    /// Cancel a secondary market order
    pub fn cancel_secondary_order(
        ctx: Context<CancelSecondaryOrder>,
        event_id: String,
        order_id: u64,
    ) -> Result<()> {
        instructions::secondary::cancel_secondary_order::handler(ctx, event_id, order_id)
    }

    /// Update price snapshot (backend authority)
    pub fn update_price_snapshot(
        ctx: Context<UpdatePriceSnapshot>,
        event_id: String,
        best_yes_bid: u64,
        best_yes_ask: u64,
        best_no_bid: u64,
        best_no_ask: u64,
    ) -> Result<()> {
        instructions::secondary::update_price_snapshot::handler(
            ctx,
            event_id,
            best_yes_bid,
            best_yes_ask,
            best_no_bid,
            best_no_ask,
        )
    }

    /// Resolve secondary market and set winning outcome (admin only)
    pub fn resolve_secondary_market(
        ctx: Context<ResolveSecondaryMarket>,
        event_id: String,
        winning_outcome: bool,
    ) -> Result<()> {
        instructions::secondary::resolve_secondary_market::handler(ctx, event_id, winning_outcome)
    }

    /// Disburse winnings to winner (admin/backend)
    pub fn disburse_winnings(
        ctx: Context<DisburseWinnings>,
        event_id: String,
        claim_id: u64,
    ) -> Result<()> {
        instructions::secondary::disburse_winnings::handler(ctx, event_id, claim_id)
    }

    /// Claim payout manually (fallback for users)
    pub fn claim_payout(
        ctx: Context<ClaimPayout>,
        event_id: String,
    ) -> Result<()> {
        instructions::secondary::claim_payout::handler(ctx, event_id)
    }
}