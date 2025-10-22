# SECONDARY MARKET - ARCHITECTURAL DESIGN & FLOW

## 🏗️ SMART CONTRACT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│              SECONDARY MARKET SMART CONTRACT                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              ACCOUNT STRUCTURES (6 Total)                    │   │
│  │                                                              │   │
│  │  • SecondaryMarketState    → Market status & prices          │   │
│  │  • SecondaryOrder          → Seller's listing                │   │
│  │  • SecondaryBid            → Buyer's offer                   │   │
│  │  • SettledTrade            → Completed trade record          │   │
│  │  • ShareLock               → Prevents share misuse           │   │
│  │  • PayoutClaim             → Payout tracking                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              INSTRUCTIONS (10 Total)                         │   │
│  │                                                              │   │
│  │  SETUP (1):                                                  │   │
│  │  • open_secondary_market()                                   │   │
│  │                                                              │   │
│  │  TRADING (4):                                                │   │
│  │  • list_share_for_sale()                                     │   │
│  │  • cancel_secondary_order()                                  │   │
│  │  • place_secondary_bid()                                     │   │
│  │  • accept_secondary_bid()                                    │   │
│  │                                                              │   │
│  │  SETTLEMENT (1):                                             │   │
│  │  • batch_settle_trades()                                     │   │
│  │                                                              │   │
│  │  RESOLUTION (2):                                             │   │
│  │  • resolve_secondary_market()                                │   │
│  │  • disburse_winnings()                                       │   │
│  │                                                              │   │
│  │  UTILITIES (2):                                              │   │
│  │  • claim_payout()                                            │   │
│  │  • update_price_snapshot()                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              SECURITY MECHANISMS                             │   │
│  │                                                              │   │
│  │  • Signature Verification (seller + buyer)                   │   │
│  │  • Share Locking (prevents double-selling)                   │   │
│  │  • Atomic Settlement (all-or-nothing)                        │   │
│  │  • Reentrancy Protection (CEI pattern)                       │   │
│  │  • Batch Processing (multiple trades per tx)                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 SMART CONTRACT WORKFLOW PHASES

### PHASE 1: MARKET INITIALIZATION

```
INSTRUCTION: open_secondary_market()

Signer: Admin
Accounts:
  ├─ event (mut)
  ├─ secondary_market_state (mut, new)
  └─ system_program

Validations:
  ├─ Event.status == PrimaryClosed
  ├─ Admin is authorized
  └─ Secondary market not already open

Updates:
  ├─ Event.status = SecondaryActive
  ├─ Event.secondary_market_opened_at = now
  ├─ SecondaryMarketState created with:
  │  ├─ status = Open
  │  ├─ best_yes_bid = 0
  │  ├─ best_yes_ask = 0
  │  ├─ best_no_bid = 0
  │  ├─ best_no_ask = 0
  │  ├─ total_trades = 0
  │  └─ total_volume = 0

Events Emitted:
  └─ SecondaryMarketOpened { event_id, timestamp }
```

---

### PHASE 2: LISTING & BIDDING

```
INSTRUCTION 1: list_share_for_sale()

Signer: Seller
Accounts:
  ├─ seller_share_token (mut)
  ├─ secondary_order (mut, new)
  ├─ share_lock (mut, new)
  ├─ event (mut)
  └─ system_program

Parameters:
  ├─ quantity: u64
  ├─ price: u64 (in lamports)
  └─ order_id: u64

Validations:
  ├─ Event.status == SecondaryActive
  ├─ Seller owns share_token
  ├─ Quantity > 0 && Quantity <= share_token.quantity
  ├─ Price > 0 && Price < 1 SOL
  ├─ Share not already locked
  └─ Order ID unique

Updates:
  ├─ ShareToken.is_locked = true
  ├─ ShareToken.lock_order_id = order_id
  ├─ ShareToken.locked_at = now
  ├─ SecondaryOrder created with:
  │  ├─ seller
  │  ├─ share_type
  │  ├─ quantity
  │  ├─ price
  │  ├─ status = Active
  │  └─ created_at = now
  ├─ ShareLock created with:
  │  ├─ order_id
  │  ├─ seller
  │  ├─ share_token_pubkey
  │  ├─ quantity
  │  └─ locked_at = now

Events Emitted:
  └─ ShareListed { seller, share_type, quantity, price, order_id }

---

INSTRUCTION 2: place_secondary_bid()

Signer: Buyer
Accounts:
  ├─ secondary_order (mut)
  ├─ secondary_bid (mut, new)
  ├─ event (mut)
  └─ system_program

Parameters:
  ├─ order_id: u64
  ├─ bid_price: u64 (in lamports)
  ├─ quantity: u64
  └─ bid_id: u64

Validations:
  ├─ Event.status == SecondaryActive
  ├─ SecondaryOrder.status == Active
  ├─ Bid quantity <= order quantity
  ├─ Bid price > 0 && Bid price < 1 SOL
  ├─ Bid ID unique
  └─ Bid not expired (24 hours)

Updates:
  ├─ SecondaryBid created with:
  │  ├─ order_id
  │  ├─ buyer
  │  ├─ bid_price
  │  ├─ quantity
  │  ├─ status = Pending
  │  └─ created_at = now

Events Emitted:
  └─ SecondaryBidPlaced { order_id, buyer, bid_price, quantity, bid_id }

---

INSTRUCTION 3: accept_secondary_bid()

Signer: Seller
Accounts:
  ├─ secondary_order (mut)
  ├─ secondary_bid (mut)
  ├─ event (mut)
  └─ system_program

Parameters:
  ├─ order_id: u64
  └─ bid_id: u64

Validations:
  ├─ Event.status == SecondaryActive
  ├─ SecondaryOrder.seller == signer
  ├─ SecondaryBid.status == Pending
  ├─ Bid not expired (1 hour)
  └─ Bid quantity <= order quantity

Updates:
  ├─ SecondaryBid.status = Accepted
  ├─ SecondaryBid.accepted_at = now
  ├─ SecondaryOrder.status = PartiallyFilled (if partial)
  ├─ SecondaryOrder.status = Filled (if full)

Events Emitted:
  └─ SecondaryBidAccepted { order_id, bid_id, seller, buyer, quantity, price }
```

---

### PHASE 3: BATCH SETTLEMENT

```
INSTRUCTION 4: batch_settle_trades()

Signer: Settlement Authority (Backend)
Accounts (per trade):
  ├─ seller_share_token (mut)
  ├─ buyer_share_token (mut, new or existing)
  ├─ seller_sol_account (mut)
  ├─ buyer_sol_account (mut)
  ├─ fee_recipient_account (mut)
  ├─ secondary_order (mut)
  ├─ secondary_bid (mut)
  ├─ settled_trade (mut, new)
  ├─ share_lock (mut)
  ├─ event (mut)
  ├─ token_program
  └─ system_program

Parameters:
  └─ trades: Vec<Trade> where Trade = {
       seller: Pubkey,
       buyer: Pubkey,
       share_id: u64,
       price: u64,
       quantity: u64,
       seller_sig: [u8; 64],
       buyer_sig: [u8; 64]
     }

Validations (per trade):
  ├─ Verify seller signature
  ├─ Verify buyer signature
  ├─ Seller owns share_token
  ├─ Buyer has sufficient SOL
  ├─ Share is locked
  ├─ Price in valid range (0 < p < 1 SOL)
  ├─ Quantity > 0
  └─ Max 100 trades per batch

Updates (per trade):
  ├─ Calculate fee: price × quantity × 0.02
  ├─ Transfer SOL: buyer → seller (price × quantity - fee)
  ├─ Transfer SOL: buyer → fee_recipient (fee)
  ├─ Transfer shares: seller → buyer (quantity)
  ├─ Update ShareToken.owner = buyer
  ├─ Update ShareToken.is_locked = false
  ├─ Update ShareToken.transfer_history
  ├─ Create SettledTrade record with:
  │  ├─ seller
  │  ├─ buyer
  │  ├─ share_type
  │  ├─ quantity
  │  ├─ price
  │  ├─ fee
  │  ├─ settled_at = now
  │  └─ tx_hash (implicit)
  ├─ Update SecondaryMarketState.total_trades++
  ├─ Update SecondaryMarketState.total_volume += (price × quantity)
  └─ Delete ShareLock account

Events Emitted (per trade):
  └─ ShareTransferred { seller, buyer, share_type, quantity, price, fee, timestamp }
```

---

### PHASE 4: PRICE TRACKING

```
INSTRUCTION 5: update_price_snapshot()

Signer: Pricing Authority (Backend)
Accounts:
  ├─ secondary_market_state (mut)
  ├─ event (mut)
  └─ system_program

Parameters:
  ├─ best_yes_bid: u64
  ├─ best_yes_ask: u64
  ├─ best_no_bid: u64
  ├─ best_no_ask: u64
  └─ timestamp: i64

Validations:
  ├─ Event.status == SecondaryActive
  ├─ All prices > 0 && < 1 SOL
  ├─ Bid <= Ask for each share type
  └─ Timestamp is recent (within 5 mins)

Updates:
  ├─ SecondaryMarketState.best_yes_bid = best_yes_bid
  ├─ SecondaryMarketState.best_yes_ask = best_yes_ask
  ├─ SecondaryMarketState.best_no_bid = best_no_bid
  ├─ SecondaryMarketState.best_no_ask = best_no_ask
  ├─ SecondaryMarketState.last_price_update = now
  ├─ Event.price_history.push(PriceSnapshot {
  │    yes_bid: best_yes_bid,
  │    yes_ask: best_yes_ask,
  │    no_bid: best_no_bid,
  │    no_ask: best_no_ask,
  │    timestamp: now
  │  })

Events Emitted:
  └─ PriceSnapshotUpdated {
       yes_bid, yes_ask, no_bid, no_ask, timestamp
     }
```

---

### PHASE 5: MARKET RESOLUTION & PAYOUTS

```
INSTRUCTION 6: resolve_secondary_market()

Signer: Admin
Accounts:
  ├─ event (mut)
  ├─ secondary_market_state (mut)
  └─ system_program

Parameters:
  ├─ event_id: Pubkey
  └─ winning_outcome: bool (true = YES wins, false = NO wins)

Validations:
  ├─ Event.status == SecondaryActive
  ├─ Admin is authorized
  └─ Match has ended (timestamp check)

Updates:
  ├─ Event.status = Resolved
  ├─ Event.winning_outcome = winning_outcome
  ├─ SecondaryMarketState.status = Closed
  ├─ SecondaryMarketState.closed_at = now

Events Emitted:
  └─ SecondaryMarketResolved { event_id, winning_outcome, timestamp }

---

INSTRUCTION 7: disburse_winnings()

Signer: Admin
Accounts (per winner):
  ├─ winner_share_token (mut)
  ├─ winner_sol_account (mut)
  ├─ payout_claim (mut, new)
  ├─ event (mut)
  ├─ secondary_market_state (mut)
  ├─ token_program
  └─ system_program

Parameters:
  ├─ event_id: Pubkey
  ├─ winners: Vec<Winner> where Winner = {
  │    winner: Pubkey,
  │    share_quantity: u64
  │  }

Validations:
  ├─ Event.status == Resolved
  ├─ Winner owns winning shares
  ├─ Payout not already claimed
  └─ Max 50 winners per transaction

Updates (per winner):
  ├─ Calculate payout: share_quantity × 1 SOL
  ├─ Transfer SOL to winner
  ├─ Create PayoutClaim record with:
  │  ├─ winner
  │  ├─ event_id
  │  ├─ share_quantity
  │  ├─ payout_amount
  │  ├─ claimed_at = now
  │  └─ status = Claimed
  ├─ Update Event.total_payouts += payout_amount

Events Emitted (per winner):
  └─ WinningsDisbursed { winner, share_quantity, payout_amount, timestamp }

---

INSTRUCTION 8: claim_payout() [Fallback]

Signer: Winner
Accounts:
  ├─ winner_share_token (mut)
  ├─ winner_sol_account (mut)
  ├─ payout_claim (mut, new)
  ├─ event (mut)
  └─ system_program

Parameters:
  └─ event_id: Pubkey

Validations:
  ├─ Event.status == Resolved
  ├─ Signer owns winning shares
  ├─ Payout not already claimed
  └─ Share quantity > 0

Updates:
  ├─ Calculate payout: share_quantity × 1 SOL
  ├─ Transfer SOL to winner
  ├─ Create PayoutClaim record
  ├─ Mark as claimed

Events Emitted:
  └─ PayoutClaimed { winner, share_quantity, payout_amount, timestamp }
```

---

## 📊 SMART CONTRACT STATE TRANSITIONS

```
MARKET LIFECYCLE:

PrimaryClosed
    │
    ├─ open_secondary_market()
    │
    ▼
SecondaryActive
    │
    ├─ list_share_for_sale()       [Multiple times]
    ├─ place_secondary_bid()       [Multiple times]
    ├─ accept_secondary_bid()      [Multiple times]
    ├─ batch_settle_trades()       [Multiple times]
    ├─ update_price_snapshot()     [Every 2 mins]
    │
    ├─ resolve_secondary_market()
    │
    ▼
Resolved
    │
    ├─ disburse_winnings()
    ├─ claim_payout()               [Fallback]
    │
    ▼
Closed

---

ORDER LIFECYCLE:

Active
    │
    ├─ place_secondary_bid()
    │
    ▼
PartiallyFilled (if partial acceptance)
    │
    ├─ place_secondary_bid()       [More bids]
    ├─ accept_secondary_bid()      [Accept more]
    │
    ▼
Filled (when all quantity accepted)
    │
    ├─ batch_settle_trades()
    │
    ▼
Settled

OR

Active
    │
    ├─ cancel_secondary_order()
    │
    ▼
Cancelled

---

BID LIFECYCLE:

Pending
    │
    ├─ accept_secondary_bid()
    │
    ▼
Accepted
    │
    ├─ batch_settle_trades()
    │
    ▼
Settled

OR

Pending
    │
    ├─ [Expires after 1 hour]
    │
    ▼
Expired
```

---

## 🔐 SMART CONTRACT SECURITY MECHANISMS

```
SIGNATURE VERIFICATION:
├─ Seller signs trade with private key
├─ Buyer signs trade with private key
├─ Smart contract verifies both signatures
├─ Prevents unauthorized transfers
└─ Audit trail for all trades

SHARE LOCKING:
├─ When share listed: is_locked = true
├─ Prevents seller from transferring
├─ Prevents double-selling
├─ Unlocked after settlement
└─ Minimal on-chain overhead

ATOMIC SETTLEMENT:
├─ All-or-nothing transactions
├─ No partial fills
├─ Consistent state
├─ Batch processing (up to 100 trades)
└─ Rollback on any failure

REENTRANCY PROTECTION:
├─ Checks-Effects-Interactions (CEI) pattern
├─ State updated before transfers
├─ No recursive calls
├─ Safe from reentrancy attacks
└─ Follows Solana best practices

VALIDATION CHECKS:
├─ Seller owns shares
├─ Buyer has SOL
├─ Prices in valid range (0 < p < 1 SOL)
├─ Quantities > 0
├─ Shares not already locked
├─ Orders/bids not expired
├─ Market status correct
└─ Admin authorization verified
```

---

## 🎯 KEY DESIGN PRINCIPLES

```
1. OFF-CHAIN MATCHING, ON-CHAIN SETTLEMENT
   ├─ Orders stored off-chain (database)
   ├─ Only finalized trades on-chain
   ├─ Reduces gas costs
   ├─ Improves throughput
   └─ Maintains security via signatures

2. BATCH PROCESSING
   ├─ Settle up to 100 trades per transaction
   ├─ Amortizes gas costs
   ├─ Reduces on-chain calls
   ├─ Improves scalability
   └─ Atomic all-or-nothing

3. SIGNATURE VERIFICATION
   ├─ Both seller & buyer sign trades
   ├─ Prevents unauthorized transfers
   ├─ Audit trail for all trades
   ├─ Non-repudiation
   └─ Matches off-chain intent

4. SHARE LOCKING
   ├─ Prevents double-selling
   ├─ Ensures seller has shares
   ├─ Minimal on-chain overhead
   ├─ Unlocked after settlement
   └─ Efficient state management

5. ATOMIC TRANSACTIONS
   ├─ All-or-nothing settlement
   ├─ No partial fills
   ├─ Consistent state
   ├─ Rollback on failure
   └─ No orphaned trades

6. PRICE SNAPSHOTS
   ├─ Updated every 2 minutes
   ├─ Calculated off-chain
   ├─ Stored on-chain for reference
   ├─ Enables price history
   └─ Reduces computation

7. FALLBACK MECHANISMS
   ├─ claim_payout() for manual claims
   ├─ Retry logic for failed settlements
   ├─ Error recovery
   ├─ Ensures no lost funds
   └─ User-initiated recovery
```

---

## 🎯 KEY DESIGN PRINCIPLES

1. **Off-Chain Matching, On-Chain Settlement**
   - Minimize gas costs
   - Maximize throughput
   - Maintain security

2. **Atomic Transactions**
   - All-or-nothing settlement
   - No partial fills
   - Consistent state

3. **Signature Verification**
   - Both parties sign trades
   - Prevents unauthorized transfers
   - Audit trail

4. **Share Locking**
   - Prevents double-selling
   - Ensures seller has shares
   - Unlocked after settlement

5. **Batch Processing**
   - Multiple trades per transaction
   - Reduced gas costs
   - Improved scalability

6. **Event Emissions**
   - Real-time updates
   - Audit trail
   - Backend synchronization

7. **Fallback Mechanisms**
   - Manual claim_payout()
   - Retry logic
   - Error recovery

