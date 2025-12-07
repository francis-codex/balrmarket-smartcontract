# SECONDARY MARKET - COMPLETE IMPLEMENTATION GUIDE

## Overview

The secondary market enables peer-to-peer trading of shares **after the primary market closes** (when the match starts). It uses an **off-chain order matching engine** with **on-chain settlement** to minimize gas costs and maximize throughput.

**Key Principle**: Orders/bids managed off-chain by backend → Only finalized trades settle on-chain

---

## ACCOUNT STRUCTURES

### 1. SecondaryMarketState
**Purpose**: Track secondary market status per event

```rust
#[account]
pub struct SecondaryMarketState {
    pub event_id: String,
    pub market_id: String,
    pub status: SecondaryMarketStatus,  // Open, Paused, Closed
    pub opened_at: i64,
    pub closed_at: Option<i64>,
    pub total_trades_settled: u64,
    pub total_volume_sol: u64,
    pub best_yes_bid: u64,              // Best active YES bid price
    pub best_yes_ask: u64,              // Best active YES ask price
    pub best_no_bid: u64,               // Best active NO bid price
    pub best_no_ask: u64,               // Best active NO ask price
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SecondaryMarketStatus {
    Closed,
    Open,
    Paused,
}
```

**PDA Seed**: `["secondary_market", event_id]`

---

### 2. SecondaryOrder 
**Purpose**: Track off-chain orders (stored on-chain for reference)

```rust
#[account]
pub struct SecondaryOrder {
    pub order_id: u64,
    pub event_id: String,
    pub seller: Pubkey,
    pub share_type: ShareType,          // YES or NO
    pub quantity: u64,
    pub price_per_share: u64,           // In lamports
    pub status: SecondaryOrderStatus,   // Active, Accepted, Cancelled, Expired
    pub created_at: i64,
    pub expires_at: i64,
    pub locked_share_token: Pubkey,     // Reference to locked ShareToken
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SecondaryOrderStatus {
    Active,
    Accepted,
    Cancelled,
    Expired,
    PartiallyFilled,
}
```

**PDA Seed**: `["secondary_order", event_id, order_id]`

---

### 3. SecondaryBid
**Purpose**: Track off-chain bids (stored on-chain for reference)

```rust
#[account]
pub struct SecondaryBid {
    pub bid_id: u64,
    pub order_id: u64,                  // References SecondaryOrder
    pub event_id: String,
    pub buyer: Pubkey,
    pub bid_price: u64,                 // In lamports
    pub quantity: u64,
    pub status: SecondaryBidStatus,     // Pending, Accepted, Rejected, Expired
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SecondaryBidStatus {
    Pending,
    Accepted,
    Rejected,
    Expired,
}
```

**PDA Seed**: `["secondary_bid", event_id, bid_id]`

---

### 4. SettledTrade
**Purpose**: Immutable record of completed trades

```rust
#[account]
pub struct SettledTrade {
    pub trade_id: u64,
    pub event_id: String,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub share_type: ShareType,
    pub quantity: u64,
    pub price_per_share: u64,
    pub total_amount: u64,              // quantity * price_per_share
    pub platform_fee: u64,              // Calculated at settlement
    pub seller_receives: u64,           // total_amount - platform_fee
    pub settled_at: i64,
    pub tx_hash: String,                // For reference
    pub bump: u8,
}
```

**PDA Seed**: `["settled_trade", event_id, trade_id]`

---

### 5. ShareLock
**Purpose**: Prevent share misuse during listing

```rust
#[account]
pub struct ShareLock {
    pub share_token: Pubkey,            // Reference to locked ShareToken
    pub owner: Pubkey,
    pub event_id: String,
    pub share_type: ShareType,
    pub locked_quantity: u64,
    pub locked_at: i64,
    pub order_id: u64,                  // Associated SecondaryOrder
    pub status: LockStatus,             // Locked, Unlocked, Released
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LockStatus {
    Locked,
    Unlocked,
    Released,
}
```

**PDA Seed**: `["share_lock", share_token, order_id]`

---

### 6. PayoutClaim
**Purpose**: Track payout claims after resolution

```rust
#[account]
pub struct PayoutClaim {
    pub claim_id: u64,
    pub event_id: String,
    pub claimer: Pubkey,
    pub share_type: ShareType,
    pub winning_shares: u64,
    pub payout_amount: u64,
    pub claimed_at: i64,
    pub status: ClaimStatus,            // Pending, Claimed, Rejected
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ClaimStatus {
    Pending,
    Claimed,
    Rejected,
}
```

**PDA Seed**: `["payout_claim", event_id, claimer]`

---

### 7. Modified Event Account
**Add these fields to existing Event struct**:

```rust
pub secondary_market_state: Option<Pubkey>,  // Reference to SecondaryMarketState
pub secondary_market_opened_at: Option<i64>,
pub secondary_market_closed_at: Option<i64>,
pub total_secondary_trades: u64,
pub total_secondary_volume: u64,
pub price_history: Vec<PriceSnapshot>,       // Last 100 snapshots
```

---

### 8. Modified ShareToken Account
**Add these fields to existing ShareToken struct**:

```rust
pub is_locked: bool,                   // Locked for listing
pub lock_order_id: Option<u64>,        // Associated SecondaryOrder
pub locked_at: Option<i64>,
pub transfer_history: Vec<Transfer>,   // Track ownership changes
```

---

## INSTRUCTIONS

### SECONDARY MARKET SETUP

#### 1. open_secondary_market(event_id)
**Purpose**: Initialize secondary market when primary closes

**Requires**: Super admin  
**Parameters**:
- `event_id: String` - Target event

**Creates**: SecondaryMarketState PDA  
**Validates**:
- Event exists
- Event status = PrimaryClosed
- Secondary market not already open

**Updates**: Event.status → SecondaryActive  
**Emits**: SecondaryMarketOpened

---

### SECONDARY MARKET TRADING

#### 2. list_share_for_sale(order_id, event_id, share_type, quantity, price_per_share)
**Purpose**: Seller lists shares for sale (off-chain order, on-chain lock)

**Requires**: Share owner (signer)  
**Parameters**:
- `order_id: u64` - Unique order ID
- `event_id: String` - Target event
- `share_type: ShareType` - YES or NO
- `quantity: u64` - Shares to list
- `price_per_share: u64` - Price in lamports

**Creates**: SecondaryOrder PDA + ShareLock PDA  
**Validates**:
- Secondary market is Open
- Seller owns shares
- Quantity > 0 and ≤ available shares
- Price > 0

**Updates**: ShareToken.is_locked = true  
**Emits**: ShareListed(seller, share_type, quantity, price, order_id)

---

#### 3. cancel_secondary_order(order_id, event_id)
**Purpose**: Seller cancels listing

**Requires**: Order seller (signer)  
**Parameters**:
- `order_id: u64` - Order to cancel
- `event_id: String` - Target event

**Updates**: 
- SecondaryOrder.status → Cancelled
- ShareToken.is_locked = false
- ShareLock.status → Released

**Emits**: SecondaryOrderCancelled(order_id, seller)

---

#### 4. place_secondary_bid(bid_id, order_id, event_id, bid_price, quantity)
**Purpose**: Buyer places bid on listed shares (off-chain, stored for reference)

**Requires**: Buyer (signer)  
**Parameters**:
- `bid_id: u64` - Unique bid ID
- `order_id: u64` - Target SecondaryOrder
- `event_id: String` - Target event
- `bid_price: u64` - Bid price in lamports
- `quantity: u64` - Quantity to bid on

**Creates**: SecondaryBid PDA  
**Validates**:
- Secondary market is Open
- Order exists and is Active
- Bid price > 0
- Quantity ≤ order quantity

**Emits**: SecondaryBidPlaced(buyer, order_id, bid_price, quantity)

---

#### 5. accept_secondary_bid(bid_id, order_id, event_id)
**Purpose**: Seller accepts bid (triggers settlement)

**Requires**: Order seller (signer)  
**Parameters**:
- `bid_id: u64` - Bid to accept
- `order_id: u64` - Associated order
- `event_id: String` - Target event

**Updates**: SecondaryBid.status → Accepted  
**Emits**: SecondaryBidAccepted(order_id, bid_id)  
**Note**: Backend queues this for batch settlement

---

### BATCH SETTLEMENT (Backend-Triggered)

#### 6. batch_settle_trades(trades: Vec<Trade>)
**Purpose**: Settle multiple accepted trades atomically

**Requires**: Backend authority (signer)  
**Parameters**:
```rust
struct Trade {
    seller: Pubkey,
    buyer: Pubkey,
    share_type: ShareType,
    quantity: u64,
    price_per_share: u64,
    seller_signature: [u8; 64],        // Seller's signature
    buyer_signature: [u8; 64],         // Buyer's signature
    order_id: u64,
    bid_id: u64,
    event_id: String,
}
```

**For Each Trade**:
1. Verify seller signature
2. Verify buyer signature
3. Verify seller owns shares
4. Calculate platform fee
5. Transfer SOL: buyer → seller (minus fee)
6. Transfer shares: seller → buyer
7. Update ShareToken ownership
8. Create SettledTrade record
9. Update SecondaryMarketState volume

**Validates**:
- Both signatures valid
- Seller still owns shares
- Buyer has sufficient SOL
- Secondary market is Open

**Updates**:
- SecondaryOrder.status → Accepted
- SecondaryBid.status → Accepted
- ShareToken.owner → buyer
- ShareToken.is_locked = false
- SecondaryMarketState.total_trades_settled++
- SecondaryMarketState.total_volume_sol += total_amount

**Emits**: ShareTransferred(seller, buyer, share_type, quantity, price, timestamp)

---

### MARKET RESOLUTION

#### 7. resolve_secondary_market(event_id, winning_outcome)
**Purpose**: Resolve market and prepare payouts

**Requires**: Super admin  
**Parameters**:
- `event_id: String` - Target event
- `winning_outcome: bool` - true = YES wins, false = NO wins

**Updates**:
- Event.status → Resolved
- Event.winning_outcome = winning_outcome
- SecondaryMarketState.status → Closed
- SecondaryMarketState.closed_at = now

**Validates**:
- Event exists
- Secondary market is Open
- Match has ended

**Emits**: SecondaryMarketResolved(event_id, winning_outcome)

---

#### 8. disburse_winnings(event_id)
**Purpose**: Pay winners (batch or individual)

**Requires**: Backend authority or winner (signer)  
**Parameters**:
- `event_id: String` - Target event

**For Each Winning Share Owner**:
1. Identify current owner
2. Calculate payout: 1 SOL per winning share
3. Transfer SOL to owner
4. Create PayoutClaim record
5. Mark as claimed

**Validates**:
- Event is Resolved
- Winning outcome is set
- Owner has winning shares

**Emits**: WinningsDisbursed(event_id, winner, winning_outcome, shares, payout_amount)

---

#### 9. claim_payout(event_id, share_type)
**Purpose**: Manual fallback for payout claims

**Requires**: Share owner (signer)  
**Parameters**:
- `event_id: String` - Target event
- `share_type: ShareType` - YES or NO

**Validates**:
- Event is Resolved
- Caller owns winning shares
- Payout not already claimed

**Transfers**: 1 SOL per winning share to caller  
**Emits**: PayoutClaimed(event_id, claimer, amount)

---

### PRICE TRACKING

#### 10. update_price_snapshot(event_id)
**Purpose**: Record current best bid/ask prices (backend-triggered)

**Requires**: Backend authority  
**Parameters**:
- `event_id: String` - Target event

**Calculates**:
- Best YES bid (highest active YES bid)
- Best YES ask (lowest active YES ask)
- Best NO bid (highest active NO bid)
- Best NO ask (lowest active NO ask)

**Updates**: SecondaryMarketState with best prices  
**Stores**: PriceSnapshot in Event.price_history  
**Emits**: PriceSnapshotUpdated(event_id, yes_bid, yes_ask, no_bid, no_ask)

---

### QUERY FUNCTIONS

#### 11. get_secondary_market_state(event_id)
**Purpose**: View secondary market status

**Returns**: SecondaryMarketState with current prices and volume

---

#### 12. get_secondary_order(order_id, event_id)
**Purpose**: View specific order details

**Returns**: SecondaryOrder with status and pricing

---

#### 13. get_secondary_bids(order_id, event_id)
**Purpose**: View all bids on an order

**Returns**: Vec<SecondaryBid> filtered by order

---

#### 14. get_user_secondary_orders(user, event_id)
**Purpose**: View user's active listings

**Returns**: Vec<SecondaryOrder> for user

---

#### 15. get_settled_trades(event_id)
**Purpose**: View all settled trades for event

**Returns**: Vec<SettledTrade> with full details

---

## 🔐 SECURITY & VALIDATION

### Signature Verification
- All trades require seller + buyer signatures
- Signatures verified on-chain before settlement
- Prevents unauthorized transfers

### Share Locking
- Shares locked when listed
- Prevents double-selling
- Unlocked if order cancelled
- Released after settlement

### Reentrancy Protection
- Use Checks-Effects-Interactions pattern
- Update state before external transfers
- No recursive calls

### Price Validation
- Price > 0 and < 1 SOL
- Bid price ≤ ask price
- Prevents invalid trades

### Quantity Validation
- Quantity > 0
- Quantity ≤ available shares
- Prevents dust orders

---

## FEE STRUCTURE

**Platform Fee**: Same as primary market (configurable, max 5%)

**Calculation**:
```
total_amount = quantity × price_per_share
platform_fee = (total_amount × fee_basis_points) / 10000
seller_receives = total_amount - platform_fee
```

**Example**:
```
Seller lists 100 YES shares @ 0.75 SOL
Buyer accepts @ 0.75 SOL
Total: 75 SOL
Fee (2%): 1.5 SOL
Seller receives: 73.5 SOL
```

---

## 📊 EVENT EMISSIONS

| Event | Emitted By | Data |
|-------|-----------|------|
| SecondaryMarketOpened | open_secondary_market | event_id, timestamp |
| ShareListed | list_share_for_sale | seller, share_type, qty, price, order_id |
| SecondaryBidPlaced | place_secondary_bid | buyer, order_id, bid_price, qty |
| SecondaryBidAccepted | accept_secondary_bid | order_id, bid_id |
| ShareTransferred | batch_settle_trades | seller, buyer, share_type, qty, price |
| SecondaryMarketResolved | resolve_secondary_market | event_id, winning_outcome |
| WinningsDisbursed | disburse_winnings | winner, shares, payout_amount |
| PayoutClaimed | claim_payout | claimer, amount |
| PriceSnapshotUpdated | update_price_snapshot | yes_bid, yes_ask, no_bid, no_ask |

---

## ⚠️ ERROR CODES (New)

| Code | Error | Cause |
|------|-------|-------|
| 6200 | SecondaryMarketNotOpen | Market not in Open status |
| 6201 | SecondaryMarketAlreadyOpen | Market already open |
| 6202 | InvalidSecondaryPrice | Price invalid |
| 6203 | ShareNotLocked | Share not locked for listing |
| 6204 | ShareAlreadyLocked | Share already locked |
| 6205 | InsufficientLockedShares | Not enough locked shares |
| 6206 | InvalidSignature | Signature verification failed |
| 6207 | BidNotAccepted | Bid not in Accepted status |
| 6208 | OrderNotActive | Order not in Active status |
| 6209 | BidExpired | Bid has expired |
| 6210 | OrderExpired | Order has expired |
| 6211 | MarketNotResolved | Market not resolved yet |
| 6212 | PayoutAlreadyClaimed | Payout already claimed |
| 6213 | NoWinningShares | User has no winning shares |
| 6214 | InvalidBidQuantity | Bid quantity invalid |
| 6215 | PriceOutOfRange | Price outside valid range |

---

## WORKFLOW SUMMARY

1. **Primary market closes** → `open_secondary_market()`
2. **Seller lists shares** → `list_share_for_sale()` (shares locked)
3. **Buyers place bids** → `place_secondary_bid()` (off-chain)
4. **Seller accepts bid** → `accept_secondary_bid()` (queued)
5. **Backend batches trades** → `batch_settle_trades()` (on-chain settlement)
6. **Prices updated** → `update_price_snapshot()` (every 2 mins)
7. **Match ends** → `resolve_secondary_market()`
8. **Winners paid** → `disburse_winnings()` or `claim_payout()`

---

## 📚 CONSTRAINTS & LIMITS

| Constraint | Value | Reason |
|-----------|-------|--------|
| Min order qty | 1 | Prevent dust |
| Max order qty | 1000 | Account size |
| Price range | 0 < p < 1 SOL | Valid probability |
| Order expiry | 24 hours | Prevent stale orders |
| Bid expiry | 1 hour | Prevent stale bids |
| Batch size | 100 trades | Gas optimization |
| Platform fee | ≤5% | User protection |
| Price snapshot | Every 2 mins | Real-time pricing |

---

## IMPLEMENTATION CHECKLIST

- [ ] Create SecondaryMarketState account
- [ ] Create SecondaryOrder account
- [ ] Create SecondaryBid account
- [ ] Create SettledTrade account
- [ ] Create ShareLock account
- [ ] Create PayoutClaim account
- [ ] Modify Event account
- [ ] Modify ShareToken account
- [ ] Implement open_secondary_market()
- [ ] Implement list_share_for_sale()
- [ ] Implement cancel_secondary_order()
- [ ] Implement place_secondary_bid()
- [ ] Implement accept_secondary_bid()
- [ ] Implement batch_settle_trades()
- [ ] Implement resolve_secondary_market()
- [ ] Implement disburse_winnings()
- [ ] Implement claim_payout()
- [ ] Implement update_price_snapshot()
- [ ] Implement query functions
- [ ] Add error codes
- [ ] Add event emissions
- [ ] Write comprehensive tests
- [ ] Deploy and verify

