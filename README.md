# BALR Market

## Table of Contents
- [Executive Summary](#executive-summary)
- [Solana vs EVM Context Bridge](#solana-vs-evm-context-bridge)
- [Smart Contract Architecture Overview](#smart-contract-architecture-overview)
- [Environment Setup](#environment-setup)
- [Account Architecture & PDAs](#account-architecture--pdas)
- [Function Reference](#function-reference)
- [Integration Patterns](#integration-patterns)
- [Error Handling](#error-handling)
- [Testing and Development](#testing-and-development)

---

## Executive Summary

**BALR Market** is a sophisticated sports betting prediction market built on Solana. It allows users to create sports betting markets, place orders on event outcomes, and trade prediction shares in both primary and secondary markets.

### Key Functionality
- **Markets & Events**: Create football matches and betting events within them
- **Order Matching**: Users place YES/NO orders that get matched when prices complement to 1 SOL
- **Share Tokens**: Matched orders result in share tokens that can be traded
- **Primary/Secondary Markets**: Time-based market phases with different trading rules
- **Platform Fees**: Built-in fee collection system

### Key Differences from EVM
- **Account-based**: All data stored in separate account structures vs single contract storage
- **Rent System**: Accounts must maintain rent-exempt balance vs gas payments
- **PDAs**: Program Derived Addresses replace mappings for user/event associations
- **Cross-Program Calls**: Similar to contract interactions but with account validation
- **Transaction Structure**: Multiple instructions per transaction vs single function calls

### Prerequisites
- Solana wallet (Phantom, Solflare)
- `@solana/web3.js` >= 1.95.0
- `@coral-xyz/anchor` >= 0.30.0
- Node.js environment with TypeScript support

---

## Solana vs EVM Context Bridge

### Account Model vs Contract State
**EVM**: All contract data stored in single contract's storage slots
```solidity
mapping(address => uint256) balances;
```

**Solana**: Each piece of data stored in separate accounts with unique addresses
```typescript
// Each user's portfolio is a separate account
const [portfolioAccount] = PublicKey.findProgramAddressSync(
  [Buffer.from("portfolio"), userWallet.publicKey.toBuffer()],
  PROGRAM_ID
);
```

### Transaction Structure
**EVM**: Single function call per transaction
```typescript
await contract.placeBet(eventId, amount, prediction);
```

**Solana**: Multiple instructions per transaction with explicit account requirements
```typescript
const transaction = new Transaction().add(
  await program.methods
    .placeOrder(orderId, eventId, orderType, quantity, unitPrice)
    .accounts({
      globalState: globalStateAccount,
      event: eventAccount,
      order: orderAccount,
      escrowAccount: escrowAccount,
      buyer: wallet.publicKey,
      adminWallet: adminWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
);
```

### Wallet Integration
**EVM**: MetaMask pattern
```typescript
const signer = provider.getSigner();
await contract.connect(signer).functionName();
```

**Solana**: Wallet adapter pattern
```typescript
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
const { publicKey, signTransaction } = useWallet();
const { connection } = useConnection();
```

---

## Smart Contract Architecture Overview

### Program Structure
- **Program ID**: `CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq`
- **Network**: Configurable (localnet/devnet/mainnet)
- **Language**: Rust with Anchor framework

### Core Entities
1. **GlobalState**: Platform configuration and admin controls
2. **Market**: Football match container (Team A vs Team B)
3. **Event**: Specific betting question within a market
4. **Order**: Individual buy orders with escrow
5. **MatchedPair**: Record of matched YES/NO orders
6. **ShareToken**: Ownership tokens for matched positions
7. **OrderBook**: Trading book for each event

### State Management Flow
```
Market Creation → Event Creation → Order Placement → Order Matching → Share Minting → Settlement
```

---

## Environment Setup

### Dependencies
```bash
npm install @solana/web3.js @coral-xyz/anchor
npm install @solana/wallet-adapter-base @solana/wallet-adapter-react
npm install @solana/wallet-adapter-phantom @solana/wallet-adapter-solflare
```

### Basic Configuration
```typescript
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';

// Program configuration
export const PROGRAM_ID = new PublicKey('CYCLSN9sVJGKo4xy3daXvH3KFD66wPgDvAuFVRhc6RDq');
export const NETWORK = 'devnet'; // or 'mainnet-beta'
export const connection = new Connection(clusterApiUrl(NETWORK));

// Initialize program
const provider = AnchorProvider.env();
const program = new Program(idl as Idl, PROGRAM_ID, provider);
```

### Wallet Setup
```typescript
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

const network = WalletAdapterNetwork.Devnet;
const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter({ network }),
];

// Wrap your app
<ConnectionProvider endpoint={clusterApiUrl(network)}>
  <WalletProvider wallets={wallets} autoConnect>
    <YourApp />
  </WalletProvider>
</ConnectionProvider>
```

---

## Account Architecture & PDAs

### Global State Account
**PDA**: `["global_state"]`
```typescript
const [globalState] = PublicKey.findProgramAddressSync(
  [Buffer.from("global_state")],
  PROGRAM_ID
);
```
**Purpose**: Platform configuration, admin controls, fee settings

### Market Account
**PDA**: `["market", market_id]`
```typescript
const [marketAccount] = PublicKey.findProgramAddressSync(
  [Buffer.from("market"), Buffer.from(marketId)],
  PROGRAM_ID
);
```
**Purpose**: Football match information (Team A vs Team B, timestamp)

### Event Account
**PDA**: `["event", market_id, event_id]`
```typescript
const [eventAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("event"),
    Buffer.from(marketId),
    Buffer.from(eventId)
  ],
  PROGRAM_ID
);
```
**Purpose**: Specific betting question, share limits, pricing, timing

### Order Account
**PDA**: `["order", event_id, order_id_bytes]`
```typescript
const orderIdBuffer = Buffer.allocUnsafe(8);
orderIdBuffer.writeBigUInt64LE(BigInt(orderId));

const [orderAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("order"),
    Buffer.from(eventId),
    orderIdBuffer
  ],
  PROGRAM_ID
);
```
**Purpose**: Individual buy order with quantity, price, status

### Escrow Account
**PDA**: `["escrow", event_id, order_id_bytes]`
```typescript
const [escrowAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("escrow"),
    Buffer.from(eventId),
    orderIdBuffer
  ],
  PROGRAM_ID
);
```
**Purpose**: Holds SOL for pending orders

### Share Token Account
**PDA**: `["share", event_id, owner, share_type_bytes]`
```typescript
const shareType = "yes"; // or "no"
const [shareTokenAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("share"),
    Buffer.from(eventId),
    ownerPublicKey.toBuffer(),
    Buffer.from(shareType)
  ],
  PROGRAM_ID
);
```
**Purpose**: User's share ownership for specific event outcome

---

## Function Reference

### 1. Initialize Global State

**Function**: `initialize_global_state`
- **Purpose**: One-time platform setup by admin
- **Frontend Usage**: Admin panel initialization
- **When to Call**: Only once during platform deployment

**Required Accounts**:
- `globalState` (init): Platform configuration account
- `admin` (signer): Platform administrator wallet
- `systemProgram`: Solana system program

**Parameters**:
- **Frontend Must Provide**: `admin` (Pubkey), `platform_fee_primary` (u16), `platform_fee_secondary` (u16)
- **Auto-Generated**: None
- **Conditional**: None

**TypeScript Example**:
```typescript
async function initializeGlobalState(
  admin: PublicKey,
  platformFeePrimary: number, // basis points (e.g., 200 = 2%)
  platformFeeSecondary: number
) {
  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    PROGRAM_ID
  );

  const tx = await program.methods
    .initializeGlobalState(admin, platformFeePrimary, platformFeeSecondary)
    .accounts({
      globalState,
      admin: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

**Error Handling**:
- `Unauthorized`: Only designated admin can initialize
- `PlatformFeeExceedsMaximum`: Fee cannot exceed 5%

---

### 2. Create Market

**Function**: `create_market`
- **Purpose**: Create a new football match market
- **Frontend Usage**: Admin creates upcoming match
- **When to Call**: 24+ hours before match starts

**Required Accounts**:
- `globalState` (mut): Platform state
- `market` (init): New market account
- `admin` (signer, mut): Admin wallet (pays for account creation)
- `systemProgram`: Solana system program

**Parameters**:
- **Frontend Must Provide**: `market_id` (String ≤50 chars), `team_a` (String ≤100 chars), `team_b` (String ≤100 chars), `match_timestamp` (i64)
- **Auto-Generated**: Market account PDA
- **Conditional**: None

**Pre-transaction Setup**:
- Ensure match timestamp is at least 24 hours in future
- Verify admin has sufficient SOL for account rent

**TypeScript Example**:
```typescript
async function createMarket(
  marketId: string,
  teamA: string,
  teamB: string,
  matchTimestamp: number // Unix timestamp
) {
  // Validation
  if (marketId.length > 50) throw new Error("Market ID too long");
  if (teamA.length > 100 || teamB.length > 100) throw new Error("Team name too long");
  
  const currentTime = Math.floor(Date.now() / 1000);
  if (matchTimestamp <= currentTime + 86400) {
    throw new Error("Match must be at least 24 hours in future");
  }

  // Account derivation
  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    PROGRAM_ID
  );
  
  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(marketId)],
    PROGRAM_ID
  );

  const tx = await program.methods
    .createMarket(marketId, teamA, teamB, new anchor.BN(matchTimestamp))
    .accounts({
      globalState,
      market,
      admin: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

**State Changes**: Creates market account, increments global event counter
**UI Considerations**: Show loading state, confirm account creation cost

---

### 3. Create Event

**Function**: `create_event`
- **Purpose**: Create specific betting question within a market
- **Frontend Usage**: Admin creates prediction opportunities
- **When to Call**: After market creation, before match starts

**Required Accounts**:
- `globalState` (mut): Platform state
- `market` (mut): Parent market account
- `event` (init): New event account
- `orderBook` (init): Order book for this event
- `admin` (signer, mut): Admin wallet
- `systemProgram`: Solana system program

**Parameters**:
- **Frontend Must Provide**: `event_id` (String ≤50), `question` (String ≤200), `max_shares` (u32, even number ≤1000), `opta_odds_yes` (u16, basis points), `match_timestamp` (i64)
- **Auto-Generated**: Event and orderbook PDAs, normalized odds, share prices
- **Conditional**: None

**Pre-transaction Setup**:
- Market must exist
- Admin needs SOL for two account creations (event + orderbook)

**TypeScript Example**:
```typescript
async function createEvent(
  marketId: string,
  eventId: string,
  question: string,
  maxShares: number, // Must be even, ≤1000
  optaOddsYes: number // Basis points (e.g., 6000 = 60% chance)
) {
  // Validation
  if (eventId.length > 50) throw new Error("Event ID too long");
  if (question.length > 200) throw new Error("Question too long");
  if (maxShares % 2 !== 0 || maxShares > 1000) throw new Error("Invalid share count");

  // Account derivation
  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")], PROGRAM_ID
  );
  
  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(marketId)], PROGRAM_ID
  );
  
  const [event] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)], PROGRAM_ID
  );
  
  const [orderBook] = PublicKey.findProgramAddressSync(
    [Buffer.from("orderbook"), Buffer.from(eventId), Buffer.from("primary")], PROGRAM_ID
  );

  const matchTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24h from now

  const tx = await program.methods
    .createEvent(eventId, question, maxShares, optaOddsYes, new anchor.BN(matchTimestamp))
    .accounts({
      globalState,
      market,
      event,
      orderBook,
      admin: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

**State Changes**: Creates event and orderbook accounts, calculates YES/NO prices from odds
**UI Considerations**: Display calculated share prices, show account creation costs

---

### 4. Place Order

**Function**: `place_order`
- **Purpose**: Place buy order for YES or NO shares
- **Frontend Usage**: Core user trading function
- **When to Call**: During primary market phase (before match starts)

**Required Accounts**:
- `globalState`: Platform state (validation)
- `event` (mut): Target event account
- `order` (init): New order account
- `escrowAccount` (init): Escrow for order funds
- `buyer` (signer, mut): User wallet
- `adminWallet` (mut): Fee recipient
- `systemProgram`: Solana system program

**Parameters**:
- **Frontend Must Provide**: `order_id` (u64), `event_id` (String), `order_type` (YES/NO), `quantity` (u64 ≤500), `unit_price` (u64, lamports per share)
- **Auto-Generated**: Order and escrow PDAs, total cost calculation
- **Conditional**: Platform fee calculation

**Pre-transaction Setup**:
- Check user has sufficient SOL balance
- Validate primary market is still open
- Calculate total cost including platform fee

**TypeScript Example**:
```typescript
interface OrderParams {
  eventId: string;
  orderType: 'YES' | 'NO';
  quantity: number; // Number of shares
  unitPrice: number; // Price per share in lamports
}

async function placeOrder({ eventId, orderType, quantity, unitPrice }: OrderParams) {
  // Generate unique order ID
  const orderId = Date.now(); // Better: use proper ID generation
  
  // Validation
  if (quantity <= 0 || quantity > 500) throw new Error("Invalid quantity");
  if (unitPrice <= 0 || unitPrice >= 1_000_000_000) throw new Error("Invalid price");

  // Account derivation
  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")], PROGRAM_ID
  );

  // Find market_id from event (you'll need this from your state/API)
  const marketId = await getMarketIdForEvent(eventId);
  
  const [event] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)], PROGRAM_ID
  );

  const orderIdBuffer = Buffer.allocUnsafe(8);
  orderIdBuffer.writeBigUInt64LE(BigInt(orderId));
  
  const [order] = PublicKey.findProgramAddressSync(
    [Buffer.from("order"), Buffer.from(eventId), orderIdBuffer], PROGRAM_ID
  );
  
  const [escrowAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(eventId), orderIdBuffer], PROGRAM_ID
  );

  // Get admin wallet from global state
  const globalStateAccount = await program.account.globalState.fetch(globalState);
  const adminWallet = globalStateAccount.admin;

  // Calculate costs
  const totalAmount = quantity * unitPrice;
  const platformFee = Math.floor(totalAmount * globalStateAccount.platformFeePrimary / 10000);
  const totalCost = totalAmount + platformFee;

  // Check user balance
  const userBalance = await connection.getBalance(wallet.publicKey);
  if (userBalance < totalCost + 5000) { // Add buffer for tx fee
    throw new Error("Insufficient balance");
  }

  const orderTypeEnum = orderType === 'YES' ? { yes: {} } : { no: {} };

  const tx = await program.methods
    .placeOrder(
      new anchor.BN(orderId),
      eventId,
      orderTypeEnum,
      new anchor.BN(quantity),
      new anchor.BN(unitPrice)
    )
    .accounts({
      globalState,
      event,
      order,
      escrowAccount,
      buyer: wallet.publicKey,
      adminWallet,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { tx, orderId, totalCost, platformFee };
}
```

**State Changes**: Creates order and escrow accounts, transfers SOL to escrow and fee to admin
**UI Considerations**: Show total cost breakdown, loading states, balance validation

---

### 5. Cancel Order

**Function**: `cancel_order`
- **Purpose**: Cancel pending order and refund escrowed SOL
- **Frontend Usage**: User order management
- **When to Call**: When order is still pending

**Required Accounts**:
- `globalState`: Platform state
- `event`: Event account (validation)
- `order` (mut): Order to cancel
- `escrowAccount` (mut): Escrow to refund from
- `buyer` (signer, mut): Order owner
- `systemProgram`: Solana system program

**Parameters**:
- **Frontend Must Provide**: `order_id` (u64), `event_id` (String)
- **Auto-Generated**: Account PDAs
- **Conditional**: None

**TypeScript Example**:
```typescript
async function cancelOrder(eventId: string, orderId: number) {
  const orderIdBuffer = Buffer.allocUnsafe(8);
  orderIdBuffer.writeBigUInt64LE(BigInt(orderId));

  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")], PROGRAM_ID
  );

  const marketId = await getMarketIdForEvent(eventId);
  
  const [event] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)], PROGRAM_ID
  );

  const [order] = PublicKey.findProgramAddressSync(
    [Buffer.from("order"), Buffer.from(eventId), orderIdBuffer], PROGRAM_ID
  );

  const [escrowAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(eventId), orderIdBuffer], PROGRAM_ID
  );

  // Verify order exists and is owned by user
  const orderAccount = await program.account.order.fetch(order);
  if (!orderAccount.buyer.equals(wallet.publicKey)) {
    throw new Error("Not your order");
  }
  if (orderAccount.status !== "Pending") {
    throw new Error("Order cannot be cancelled");
  }

  const tx = await program.methods
    .cancelOrder(new anchor.BN(orderId), eventId)
    .accounts({
      globalState,
      event,
      order,
      escrowAccount,
      buyer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

**Error Handling**:
- `OrderNotFound`: Invalid order ID
- `Unauthorized`: Not order owner
- `OrderNotPending`: Already matched or cancelled

---

### 6. Match Orders

**Function**: `match_orders`
- **Purpose**: Match complementary YES/NO orders
- **Frontend Usage**: Market maker or automated matching
- **When to Call**: When compatible orders exist (prices sum to ~1 SOL)

**Required Accounts**:
- `globalState`: Platform state
- `event` (mut): Event account
- `yesOrder` (mut): YES order to match
- `noOrder` (mut): NO order to match
- `yesEscrow` (mut): YES order escrow
- `noEscrow` (mut): NO order escrow
- `matchedPair` (init): Record of the match
- `yesBuyer` (mut): YES order owner
- `noBuyer` (mut): NO order owner
- `authority` (signer, mut): Matching authority
- `systemProgram`: Solana system program

**Parameters**:
- **Frontend Must Provide**: `event_id` (String), `yes_order_id` (u64), `no_order_id` (u64)
- **Auto-Generated**: Matched pair PDA, match quantity calculation
- **Conditional**: Price sum validation (must equal ~1 SOL)

**Pre-transaction Setup**:
- Identify compatible orders (YES price + NO price ≈ 1 SOL)
- Verify both orders are pending
- Calculate match quantity (min of both order quantities)

**TypeScript Example**:
```typescript
async function matchOrders(
  eventId: string, 
  yesOrderId: number, 
  noOrderId: number
) {
  // Account derivation helpers
  const getOrderPDA = (orderId: number) => {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigUInt64LE(BigInt(orderId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("order"), Buffer.from(eventId), buffer], PROGRAM_ID
    )[0];
  };

  const getEscrowPDA = (orderId: number) => {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigUInt64LE(BigInt(orderId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(eventId), buffer], PROGRAM_ID
    )[0];
  };

  // Fetch order details for validation
  const yesOrder = await program.account.order.fetch(getOrderPDA(yesOrderId));
  const noOrder = await program.account.order.fetch(getOrderPDA(noOrderId));

  // Validate price compatibility (sum should be ~1 SOL)
  const priceSum = yesOrder.unitPrice.toNumber() + noOrder.unitPrice.toNumber();
  const oneSol = 1_000_000_000;
  const tolerance = oneSol / 100; // 1% tolerance
  
  if (Math.abs(priceSum - oneSol) > tolerance) {
    throw new Error("Orders not price compatible");
  }

  // Verify orders are pending
  if (yesOrder.status !== "Pending" || noOrder.status !== "Pending") {
    throw new Error("Orders must be pending");
  }

  // Account setup
  const marketId = await getMarketIdForEvent(eventId);
  
  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")], PROGRAM_ID
  );
  
  const [event] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)], PROGRAM_ID
  );

  const eventAccount = await program.account.event.fetch(event);
  
  const matchIdBuffer = Buffer.allocUnsafe(8);
  matchIdBuffer.writeBigUInt64LE(BigInt(eventAccount.totalMatches));
  
  const [matchedPair] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(eventId), matchIdBuffer], PROGRAM_ID
  );

  const tx = await program.methods
    .matchOrders(eventId, new anchor.BN(yesOrderId), new anchor.BN(noOrderId))
    .accounts({
      globalState,
      event,
      yesOrder: getOrderPDA(yesOrderId),
      noOrder: getOrderPDA(noOrderId),
      yesEscrow: getEscrowPDA(yesOrderId),
      noEscrow: getEscrowPDA(noOrderId),
      matchedPair,
      yesBuyer: yesOrder.buyer,
      noBuyer: noOrder.buyer,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

**State Changes**: Updates order quantities, creates matched pair, transfers escrowed funds between buyers
**UI Considerations**: Show match details, quantity matched, remaining order amounts

---

### 7. Mint Shares

**Function**: `mint_shares`
- **Purpose**: Create share tokens for matched order pair
- **Frontend Usage**: After orders are matched, mint ownership tokens
- **When to Call**: Immediately after successful order matching

**Required Accounts**:
- `globalState`: Platform state
- `event` (mut): Event account
- `matchedPair`: Matched order record
- `yesShareToken` (init): YES share token for buyer
- `noShareToken` (init): NO share token for buyer
- `mintAuthority` (signer, mut): Share minting authority
- `systemProgram`: Solana system program

**Parameters**:
- **Frontend Must Provide**: `event_id` (String), `matched_pair_id` (u64)
- **Auto-Generated**: Share token PDAs for both buyers
- **Conditional**: None

**TypeScript Example**:
```typescript
async function mintShares(eventId: string, matchedPairId: number) {
  const matchIdBuffer = Buffer.allocUnsafe(8);
  matchIdBuffer.writeBigUInt64LE(BigInt(matchedPairId));

  const [matchedPair] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(eventId), matchIdBuffer], PROGRAM_ID
  );

  // Fetch matched pair to get buyer addresses
  const matchedPairAccount = await program.account.matchedPair.fetch(matchedPair);

  // Create share token PDAs
  const [yesShareToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("share"),
      Buffer.from(eventId),
      matchedPairAccount.yesBuyer.toBuffer(),
      Buffer.from("yes")
    ],
    PROGRAM_ID
  );

  const [noShareToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("share"),
      Buffer.from(eventId),
      matchedPairAccount.noBuyer.toBuffer(),
      Buffer.from("no")
    ],
    PROGRAM_ID
  );

  const marketId = await getMarketIdForEvent(eventId);
  const [event] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)], PROGRAM_ID
  );

  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")], PROGRAM_ID
  );

  const tx = await program.methods
    .mintShares(eventId, new anchor.BN(matchedPairId))
    .accounts({
      globalState,
      event,
      matchedPair,
      yesShareToken,
      noShareToken,
      mintAuthority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { tx, yesShareToken, noShareToken };
}
```

**State Changes**: Creates share token accounts for both buyers
**UI Considerations**: Display share token addresses, confirm minting success

---

### 8. Additional Functions

The contract includes several other functions for complete market management:

- `end_primary_market`: Close primary trading phase when event starts
- `refund_unmatched_orders`: Refund unmatched orders after primary market closes
- `collect_platform_fees`: Admin function to collect accumulated fees
- `process_match`: Post-match settlement processing

Each follows similar patterns for account derivation, parameter validation, and state management.

---

## Integration Patterns

### Wallet Connection Flow
```typescript
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

function TradingInterface() {
  const { publicKey, connect, disconnect, signTransaction } = useWallet();
  const { connection } = useConnection();

  const handleConnect = async () => {
    try {
      await connect();
      // Initialize user state, fetch portfolio, etc.
    } catch (error) {
      console.error('Wallet connection failed:', error);
    }
  };

  if (!publicKey) {
    return <button onClick={handleConnect}>Connect Wallet</button>;
  }

  return <TradingApp userWallet={publicKey} />;
}
```

### Account Monitoring with WebSockets
```typescript
function useEventUpdates(eventId: string) {
  const [eventData, setEventData] = useState(null);
  const { connection } = useConnection();

  useEffect(() => {
    const marketId = getMarketIdForEvent(eventId);
    const [eventAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), Buffer.from(marketId), Buffer.from(eventId)],
      PROGRAM_ID
    );

    const subscription = connection.onAccountChange(
      eventAccount,
      (accountInfo) => {
        const eventData = program.account.event.coder.accounts.decode(
          "Event",
          accountInfo.data
        );
        setEventData(eventData);
      }
    );

    return () => {
      connection.removeAccountChangeListener(subscription);
    };
  }, [eventId]);

  return eventData;
}
```

### Batch Transaction Pattern
```typescript
async function placeMultipleOrders(orders: OrderParams[]) {
  const transaction = new Transaction();
  
  for (const order of orders) {
    const instruction = await program.methods
      .placeOrder(/* params */)
      .accounts(/* accounts */)
      .instruction();
    
    transaction.add(instruction);
  }

  // Sign and send batch transaction
  const signature = await program.provider.sendAndConfirm(transaction);
  return signature;
}
```

### Error Boundary Implementation
```typescript
function TradingErrorBoundary({ children }: { children: React.ReactNode }) {
  const handleError = (error: Error) => {
    if (error.message.includes('6015')) {
      return 'Insufficient funds for this order';
    }
    if (error.message.includes('6021')) {
      return 'Primary market has closed for this event';
    }
    return 'Transaction failed. Please try again.';
  };

  return (
    <ErrorBoundary
      fallback={({ error }) => (
        <div className="error-message">
          {handleError(error)}
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### Loading and Pending State Management
```typescript
function useTransaction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeTransaction = async (transactionFn: () => Promise<string>) => {
    setLoading(true);
    setError(null);
    
    try {
      const signature = await transactionFn();
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        signature,
        'confirmed'
      );
      
      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }
      
      return signature;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { executeTransaction, loading, error };
}
```

---

## Error Handling

### Common Error Codes and Solutions

| Code | Error | Frontend Solution |
|------|-------|------------------|
| 6000 | Unauthorized | Check wallet connection and admin rights |
| 6015 | InsufficientFunds | Validate user balance before transaction |
| 6021 | PrimaryMarketClosed | Update UI to disable order placement |
| 6023 | InvalidOrderQuantity | Validate quantity input (1-500 shares) |
| 6024 | InvalidOrderPrice | Validate price input (0 < price < 1 SOL) |
| 6029 | CannotTradeWithSelf | Prevent users from matching their own orders |
| 6031 | InvalidPriceSum | Ensure order prices sum to ~1 SOL for matching |

### Error Handling Utilities
```typescript
export function parseAnchorError(error: any): string {
  // Extract Anchor error code
  const errorCode = error.error?.errorCode?.number;
  
  switch (errorCode) {
    case 6015:
      return "Insufficient funds. Please add SOL to your wallet.";
    case 6021:
      return "Primary market has closed. Trading is no longer available.";
    case 6023:
      return "Invalid quantity. Please enter 1-500 shares.";
    case 6024:
      return "Invalid price. Price must be between 0 and 1 SOL.";
    case 6029:
      return "Cannot trade with yourself.";
    default:
      return error.message || "Transaction failed. Please try again.";
  }
}

export function handleTransactionError(error: any) {
  console.error('Transaction error:', error);
  
  if (error.code === 4001) {
    return "Transaction cancelled by user.";
  }
  
  if (error.message.includes('insufficient funds')) {
    return "Insufficient SOL for transaction fees.";
  }
  
  return parseAnchorError(error);
}
```

---

## Testing and Development

### Local Development Setup
```bash
# Start local validator
solana-test-validator

# Deploy program locally
anchor build
anchor deploy

# Run tests
anchor test
```

### Testing Patterns
```typescript
describe('BALR Market Integration', () => {
  let program: Program<BalrMarket>;
  let provider: AnchorProvider;
  
  beforeEach(async () => {
    provider = AnchorProvider.env();
    program = new Program(idl, PROGRAM_ID, provider);
  });

  it('should place and match orders', async () => {
    // Setup market and event
    await createMarket("TEST_MARKET", "Team A", "Team B", futureTimestamp);
    await createEvent("TEST_EVENT", "Will Team A win?", 100, 6000);
    
    // Place complementary orders
    const yesOrderId = Date.now();
    const noOrderId = Date.now() + 1;
    
    await placeOrder({
      eventId: "TEST_EVENT",
      orderType: "YES",
      quantity: 10,
      unitPrice: 600_000_000 // 0.6 SOL
    });
    
    await placeOrder({
      eventId: "TEST_EVENT", 
      orderType: "NO",
      quantity: 10,
      unitPrice: 400_000_000 // 0.4 SOL
    });
    
    // Match orders
    await matchOrders("TEST_EVENT", yesOrderId, noOrderId);
    
    // Verify share tokens created
    const yesShares = await program.account.shareToken.fetch(yesShareTokenPDA);
    expect(yesShares.quantity.toNumber()).toBe(10);
  });
});
```

### Common Debugging Techniques
1. **Account Derivation**: Verify PDA seeds match contract expectations
2. **Balance Checks**: Ensure accounts have sufficient rent-exempt balance
3. **Transaction Simulation**: Use `simulate` before `send` for debugging
4. **Event Logs**: Monitor emitted events for state changes
5. **Account Data**: Fetch account data to verify state updates

### Devnet vs Mainnet Considerations
- **Devnet**: Free SOL from faucet, faster iteration, test environment
- **Mainnet**: Real SOL required, higher stakes, production environment
- **Program IDs**: May differ between networks
- **RPC Endpoints**: Different endpoints for different clusters

---

## Quick Reference

### Key Account PDAs
```typescript
// Global state
["global_state"] → Platform configuration

// Market  
["market", market_id] → Match information

// Event
["event", market_id, event_id] → Betting question

// Order & Escrow
["order", event_id, order_id_bytes] → User order
["escrow", event_id, order_id_bytes] → Order funds

// Shares
["share", event_id, owner, share_type] → User ownership
```

### Essential Parameters
- **market_id**: String ≤50 chars, unique identifier
- **event_id**: String ≤50 chars, unique within market  
- **order_id**: u64, timestamp or sequential
- **quantity**: u64, 1-500 shares per order
- **unit_price**: u64, lamports per share (0 < price < 1 SOL)
- **order_type**: "YES" or "NO" enum

### Transaction Flow
1. **Setup** → Connect wallet, derive accounts
2. **Validate** → Check balances, market status
3. **Execute** → Send transaction with proper accounts
4. **Confirm** → Wait for confirmation, handle errors
5. **Update** → Refresh UI state, notify user