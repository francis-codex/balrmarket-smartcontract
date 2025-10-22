use anchor_lang::prelude::*;
use crate::state::{OrderType, OrderStatus};

/// Comprehensive response structure for Order queries
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OrderResponse {
    /// Order account public key
    pub order_pubkey: Pubkey,
    /// Unique order identifier
    pub order_id: u64,
    /// Associated event ID
    pub event_id: String,
    /// Buyer's wallet address
    pub buyer: Pubkey,
    /// Order type (Yes/No)
    pub order_type: OrderType,
    /// Quantity of shares
    pub quantity: u64,
    /// Price per share in lamports
    pub unit_price: u64,
    /// Total amount escrowed (quantity * unit_price)
    pub total_amount: u64,
    /// Current order status
    pub status: OrderStatus,
    /// Order creation timestamp
    pub created_at: i64,
    /// Escrow account public key
    pub escrow_pubkey: Pubkey,
    /// Current escrow balance
    pub escrow_balance: u64,
}

impl OrderResponse {
    pub fn from_account(
        order_pubkey: Pubkey,
        order: &crate::state::Order,
        escrow_pubkey: Pubkey,
        escrow_balance: u64,
    ) -> Self {
        Self {
            order_pubkey,
            order_id: order.order_id,
            event_id: order.event_id.clone(),
            buyer: order.buyer,
            order_type: order.order_type.clone(),
            quantity: order.quantity,
            unit_price: order.unit_price,
            total_amount: order.total_amount,
            status: order.status.clone(),
            created_at: order.created_at,
            escrow_pubkey,
            escrow_balance,
        }
    }
}
